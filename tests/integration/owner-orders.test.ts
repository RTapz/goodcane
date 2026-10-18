// O2 owner actions and list against the real *_test database (BR-O3, BR-O4, BR-O5).
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { orderHistory, orders, payments } from '../../server/db/schema'
import { cancelOrderAsOwner, fulfilOrder, listOwnerOrders } from '../../server/services/owner/orders'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { DAY, insertOrder, makeCustomer, makeDropAt, makeFlavour } from './owner-fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-17T12:00:00Z')
const at = (days: number) => new Date(now.getTime() + days * DAY)
const ctx = { now, demoMode: false }
let dropId: string
let item: string

beforeEach(async () => {
  await resetTestDatabase(client)
  item = await makeFlavour(db, 'Raw cane')
  dropId = await makeDropAt(db, at(3))
})

const paid = () => insertOrder(db, { dropId, itemId: item, quantity: 2, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1) })
const requested = (createdDaysAgo = 0.1) => insertOrder(db, { dropId, itemId: item, quantity: 2, status: 'requested', createdAt: at(-createdDaysAgo) })
const historyOf = (orderId: string) => db.select().from(orderHistory).where(eq(orderHistory.orderId, orderId))

describe('owner cancel (BR-O4)', () => {
  it('cancelling a paid order sets refund_due and writes an owner history row', async () => {
    const orderId = await paid()
    expect(await cancelOrderAsOwner(db, orderId, ctx)).toEqual({ kind: 'done', status: 'cancelled', refundDue: true })
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order).toMatchObject({ status: 'cancelled', refundDue: true })
    expect(await historyOf(orderId)).toMatchObject([{ fromStatus: 'paid_confirmed', toStatus: 'cancelled', actor: 'owner' }])
  })

  it('cancelling a request has no refund; a cancelled order cannot be cancelled again', async () => {
    const orderId = await requested()
    expect(await cancelOrderAsOwner(db, orderId, ctx)).toEqual({ kind: 'done', status: 'cancelled', refundDue: false })
    expect(await cancelOrderAsOwner(db, orderId, ctx)).toEqual({ kind: 'not_allowed', status: 'cancelled' })
    expect(await historyOf(orderId)).toHaveLength(1)
  })
})

describe('mark fulfilled (BR-O3)', () => {
  it('works only from paid_confirmed, with an owner history row', async () => {
    const request = await requested()
    expect(await fulfilOrder(db, request, ctx)).toEqual({ kind: 'not_allowed', status: 'requested' })
    expect(await historyOf(request)).toHaveLength(0)

    const orderId = await paid()
    expect(await fulfilOrder(db, orderId, ctx)).toEqual({ kind: 'done', status: 'fulfilled', refundDue: false })
    expect(await historyOf(orderId)).toMatchObject([{ fromStatus: 'paid_confirmed', toStatus: 'fulfilled', actor: 'owner' }])
    expect(await fulfilOrder(db, orderId, ctx)).toEqual({ kind: 'not_allowed', status: 'fulfilled' })
  })

  it('an unknown order is not found', async () => {
    expect(await fulfilOrder(db, '00000000-0000-4000-8000-000000000000', ctx)).toEqual({ kind: 'not_found' })
  })
})

describe('orders list (O2)', () => {
  it('splits lapsed requests from live ones and filters by status', async () => {
    const live = await requested()
    const lapsed = await requested(3) // 3 days old with a 2-day expiry
    const all = await listOwnerOrders(db, { dropId }, now)
    expect(all.find((o) => o.id === live)?.status).toBe('requested')
    expect(all.find((o) => o.id === lapsed)?.status).toBe('lapsed')
    expect((await listOwnerOrders(db, { status: 'requested' }, now)).map((o) => o.id)).toEqual([live])
    expect((await listOwnerOrders(db, { status: 'lapsed' }, now)).map((o) => o.id)).toEqual([lapsed])
  })

  it('flags a payment received but not confirmed as refund due, and masks phones', async () => {
    const customerId = await makeCustomer(db)
    const orderId = await insertOrder(db, { dropId, itemId: item, quantity: 2, status: 'requested', createdAt: at(-0.1), customerId })
    await db.insert(payments).values({ orderId, reference: 'TEST-unconfirmed', outcome: 'success', result: 'not_confirmed', reason: 'not_enough_space', refundDue: true })
    const [view] = await listOwnerOrders(db, { dropId }, now)
    expect(view).toMatchObject({ id: orderId, unconfirmedPaymentRefundDue: true, refundDue: false, maskedPhone: '••••••••••009' })
    expect(JSON.stringify(view)).not.toContain('+233200000009')
  })
})
