// Customer cancel on C9 against the real *_test database (BR-X3, BR-O4, BR-O5), including a
// payment arriving after the cancel and a replayed payment: neither may bring the order back.
import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { orderHistory, orders } from '../../server/db/schema'
import { cancelOrderAsCustomer } from '../../server/services/orders/cancel'
import { payStart } from '../../server/services/orders/pay-start'
import { simulatePayment } from '../../server/services/payments/simulate'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, MIN, requestedOrder } from './fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-19T12:00:00Z')
const at = (ms: number) => new Date(now.getTime() + ms)
const cutOffAt = at(48 * HOUR)
let dropId: string
let itemId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  dropId = await makeDrop(db, 10, cutOffAt)
  itemId = await makeItem(db)
})

const cancel = (orderId: string, customerId: string, when = now) =>
  cancelOrderAsCustomer(db, orderId, { now: when, customerId, demoMode: true })
const pay = (orderId: string, customerId: string, when: Date, reference = `TEST-${randomUUID()}`) =>
  simulatePayment(db, { orderId, reference, outcome: 'success' }, { now: when, customerId, demoMode: true })
const order = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!
const history = (id: string) =>
  db.select().from(orderHistory).where(eq(orderHistory.orderId, id)).orderBy(asc(orderHistory.createdAt))

describe('cancelOrderAsCustomer', () => {
  it('cancels a paid order before cut-off, sets refund due and writes history as the customer', async () => {
    const a = await requestedOrder(db, dropId, itemId, 2, now)
    await payStart(db, a.orderId, { now, customerId: a.customerId, demoMode: true })
    await pay(a.orderId, a.customerId, at(MIN))
    expect(await cancel(a.orderId, a.customerId, at(2 * MIN))).toEqual({ kind: 'done', status: 'cancelled', refundDue: true })
    expect(await order(a.orderId)).toMatchObject({ status: 'cancelled', refundDue: true, holdExpiresAt: null })
    const last = (await history(a.orderId)).at(-1)
    expect(last).toMatchObject({ fromStatus: 'paid_confirmed', toStatus: 'cancelled', actor: 'customer' })
  })

  it('only the customer who owns the order can cancel it', async () => {
    const a = await requestedOrder(db, dropId, itemId, 1, now)
    const b = await requestedOrder(db, dropId, itemId, 1, now)
    expect(await cancel(a.orderId, b.customerId)).toEqual({ kind: 'not_found' })
    expect((await order(a.orderId)).status).toBe('requested')
  })

  it('refuses after cut-off', async () => {
    const a = await requestedOrder(db, dropId, itemId, 1, now)
    expect(await cancel(a.orderId, a.customerId, cutOffAt)).toEqual({ kind: 'not_allowed', status: 'requested', reason: 'after_cut_off' })
  })

  it('refuses an already-lapsed request and changes nothing', async () => {
    const a = await requestedOrder(db, dropId, itemId, 1, now)
    // Request expiry is 2 days (sample setting), and the cut-off is 2 days away: lapsed just before cut-off.
    const lapsedAt = at(48 * HOUR - MIN)
    await db.update(orders).set({ createdAt: at(-47 * HOUR) }).where(eq(orders.id, a.orderId))
    expect(await cancel(a.orderId, a.customerId, lapsedAt)).toEqual({ kind: 'not_allowed', status: 'requested', reason: 'not_allowed' })
    expect(await history(a.orderId)).toHaveLength(1)
  })
})

describe('a payment arriving after a cancel never brings the order back', () => {
  it('cancel while the payment is on its way: the payment is not confirmed and is due back', async () => {
    const a = await requestedOrder(db, dropId, itemId, 2, now)
    await payStart(db, a.orderId, { now, customerId: a.customerId, demoMode: true })
    // The customer cancels with the hold still active; the provider's success lands a moment later.
    expect((await cancel(a.orderId, a.customerId, at(MIN))).kind).toBe('done')
    const paid = await pay(a.orderId, a.customerId, at(2 * MIN))
    expect(paid).toMatchObject({ kind: 'processed', result: 'not_confirmed', reason: 'not_payable', refundDue: true })
    expect(await order(a.orderId)).toMatchObject({ status: 'cancelled', paidAt: null })
  })

  it('cancel and payment at the same moment: whichever wins, the order ends cancelled or paid, never both', async () => {
    const a = await requestedOrder(db, dropId, itemId, 2, now)
    await payStart(db, a.orderId, { now, customerId: a.customerId, demoMode: true })
    const [cancelled, paid] = await Promise.all([cancel(a.orderId, a.customerId, at(MIN)), pay(a.orderId, a.customerId, at(MIN))])
    const final = await order(a.orderId)
    expect(final.status).toBe('cancelled')
    // If the payment won the race it confirmed first, so the cancel turned it into a refund.
    if (paid.kind === 'processed' && paid.result === 'confirmed') {
      expect(cancelled).toEqual({ kind: 'done', status: 'cancelled', refundDue: true })
      expect(final.refundDue).toBe(true)
    } else {
      expect(paid).toMatchObject({ result: 'not_confirmed', refundDue: true })
    }
  })

  it('a replayed payment returns the stored result and leaves the cancelled order cancelled', async () => {
    const a = await requestedOrder(db, dropId, itemId, 2, now)
    await payStart(db, a.orderId, { now, customerId: a.customerId, demoMode: true })
    const reference = `TEST-${randomUUID()}`
    expect((await pay(a.orderId, a.customerId, at(MIN), reference)).kind).toBe('processed')
    await cancel(a.orderId, a.customerId, at(2 * MIN))
    const replayed = await pay(a.orderId, a.customerId, at(3 * MIN), reference)
    expect(replayed).toMatchObject({ kind: 'replayed', result: 'confirmed' })
    expect(await order(a.orderId)).toMatchObject({ status: 'cancelled', refundDue: true })
    // And a fresh payment attempt is refused too.
    expect(await pay(a.orderId, a.customerId, at(4 * MIN))).toMatchObject({ result: 'not_confirmed', reason: 'not_payable' })
    expect((await order(a.orderId)).status).toBe('cancelled')
  })
})
