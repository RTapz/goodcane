// /api/me data and the private-link landing against the real *_test database.
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { drops } from '../../server/db/schema'
import { landingFor } from '../../server/services/links'
import { getMe } from '../../server/services/me'
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

const now = new Date('2026-10-17T12:00:00Z')
let dropId: string
let itemId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  dropId = await makeDrop(db, 10, new Date(now.getTime() + 48 * HOUR))
  itemId = await makeItem(db)
})

async function paidCustomer(quantity: number) {
  const order = await requestedOrder(db, dropId, itemId, quantity, now)
  await payStart(db, order.orderId, { now, customerId: order.customerId, demoMode: true })
  await simulatePayment(
    db,
    { orderId: order.orderId, reference: `TEST-ME-${order.orderId}`, outcome: 'success' },
    { now: new Date(now.getTime() + MIN), customerId: order.customerId, demoMode: true }
  )
  return order
}

describe('getMe (BR-L7, BR-L8)', () => {
  it("returns only this customer's own data: masked phone, no address, last paid order lines", async () => {
    const mine = await paidCustomer(2)
    await paidCustomer(5) // someone else
    const me = await getMe(db, mine.customerId)
    expect(me).toMatchObject({
      firstName: 'Sample',
      phoneMasked: '••••••••••001',
      reminders: { state: 'none_yet' },
      lastOrder: { orderId: mine.orderId, fulfilment: 'pickup', lines: [{ menuItemId: itemId, quantity: 2, unitPricePesewas: 3500 }] }
    })
    const text = JSON.stringify(me)
    expect(text).not.toContain('+233200000001')
    expect(text).not.toContain('address')
  })

  it('has no last order for a customer who never paid', async () => {
    const unpaid = await requestedOrder(db, dropId, itemId, 1, now)
    expect((await getMe(db, unpaid.customerId))?.lastOrder).toBeNull()
  })
})

describe('landingFor: where the private link lands (BR-L3)', () => {
  it('a returning customer with a paid order and an open drop goes to C7', async () => {
    const mine = await paidCustomer(1)
    expect(await landingFor(db, mine.customerId, now)).toBe('/same-again')
  })

  it('no paid order, or no open drop ahead, goes to C1 with a welcome', async () => {
    const unpaid = await requestedOrder(db, dropId, itemId, 1, now)
    expect(await landingFor(db, unpaid.customerId, now)).toBe('/?welcome=1')
    const mine = await paidCustomer(1)
    await db.update(drops).set({ status: 'closed' }).where(eq(drops.id, dropId))
    expect(await landingFor(db, mine.customerId, now)).toBe('/?welcome=1')
  })
})
