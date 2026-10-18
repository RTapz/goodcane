// placeOrder against the real test database (goodcane_drops_test only).
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { accessTokens, customers, drops, menuItems, orderHistory, orderItems, orders } from '../../server/db/schema'
import { placeOrder, type PlaceOrderInput } from '../../server/services/orders/place-order'
import { hashToken } from '../../server/services/tokens'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  // Leave the test database empty for the next suite (the API tests seed it themselves).
  await resetTestDatabase(client)
  await client.end()
})

const HOUR = 60 * 60 * 1000
const now = new Date('2026-10-16T12:00:00Z')

let dropId: string
let otherDropId: string
let item330: string
let item500: string

async function makeDrop(capacity: number, cutOffAt: Date) {
  const [drop] = await db
    .insert(drops)
    .values({ dropAt: new Date(cutOffAt.getTime() + 72 * HOUR), cutOffAt, capacity, status: 'open' })
    .returning({ id: drops.id })
  return drop!.id
}

beforeEach(async () => {
  // A clean slate for every test. Safe: this only ever runs on a *_test database.
  await resetTestDatabase(client)
  dropId = await makeDrop(10, new Date(now.getTime() + 48 * HOUR))
  otherDropId = await makeDrop(10, new Date(now.getTime() + 96 * HOUR))
  const items = await db
    .insert(menuItems)
    .values([
      { name: 'Raw cane', tasteGroup: 'sweet', size: '330ml', pricePesewas: 3500, capacityWeight: 1 },
      { name: 'Raw cane', tasteGroup: 'sweet', size: '500ml', pricePesewas: 4500, capacityWeight: 1 }
    ])
    .returning({ id: menuItems.id })
  item330 = items[0]!.id
  item500 = items[1]!.id
})

function input(overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    dropId,
    lines: [
      { menuItemId: item330, quantity: 2 },
      { menuItemId: item500, quantity: 1 }
    ],
    firstName: 'Sample',
    phone: '+233241234567',
    fulfilment: { kind: 'pickup' },
    idempotencyKey: randomUUID(),
    ...overrides
  }
}

const ctx = (sessionCustomerId: string | null = null, at = now) => ({ now: at, sessionCustomerId, demoMode: true })
const count = async (table: typeof orders | typeof customers | typeof accessTokens) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n

describe('placeOrder (BR-O9)', () => {
  it('(a) creates one requested order with no hold, prices from the database and a history row', async () => {
    const result = await placeOrder(db, input(), ctx())
    expect(result.kind).toBe('created')
    if (result.kind !== 'created') return

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId))
    expect(order).toMatchObject({
      status: 'requested',
      holdExpiresAt: null,
      fulfilment: 'pickup',
      feePesewas: 0,
      totalPesewas: 2 * 3500 + 4500,
      isSample: true
    })
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, result.orderId))
    expect(items.map((i) => i.unitPricePesewas).sort()).toEqual([3500, 4500])
    const history = await db.select().from(orderHistory).where(eq(orderHistory.orderId, result.orderId))
    expect(history).toMatchObject([{ fromStatus: null, toStatus: 'requested', actor: 'customer' }])
    expect(await count(orders)).toBe(1)
  })

  it('stores only the hash of the new session token', async () => {
    const result = await placeOrder(db, input(), ctx())
    if (result.kind !== 'created') throw new Error(result.kind)
    expect(result.newSessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [token] = await db.select().from(accessTokens)
    expect(token).toMatchObject({ kind: 'session', customerId: result.customerId })
    expect(token!.tokenHash).toBe(hashToken(result.newSessionToken!))
    expect(token!.tokenHash).not.toBe(result.newSessionToken)
  })

  it('adds the delivery fee for the chosen sample area and keeps the address (BR-O6)', async () => {
    const result = await placeOrder(
      db,
      input({ fulfilment: { kind: 'delivery', areaId: 'sample-area-b', address: 'Sample address 12' } }),
      ctx()
    )
    if (result.kind !== 'created') throw new Error(result.kind)
    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId))
    expect(order).toMatchObject({ fulfilment: 'delivery', area: 'Area B', address: 'Sample address 12', feePesewas: 1500, totalPesewas: 13000 })
  })

  it('(b) the same idempotency key twice gives one order', async () => {
    const key = randomUUID()
    const first = await placeOrder(db, input({ idempotencyKey: key }), ctx())
    if (first.kind !== 'created') throw new Error(first.kind)
    const again = await placeOrder(db, input({ idempotencyKey: key }), ctx(first.customerId))
    const replayNoCookie = await placeOrder(db, input({ idempotencyKey: key }), ctx())
    expect(again).toEqual({ kind: 'existing', orderId: first.orderId })
    expect(replayNoCookie).toEqual({ kind: 'existing', orderId: first.orderId })
    expect(await count(orders)).toBe(1)
    expect(await count(customers)).toBe(1)
  })

  it('(b) a double tap racing in parallel still gives one order and one customer', async () => {
    const key = randomUUID()
    const results = await Promise.all([
      placeOrder(db, input({ idempotencyKey: key }), ctx()),
      placeOrder(db, input({ idempotencyKey: key }), ctx())
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(['created', 'existing'])
    expect(await count(orders)).toBe(1)
    expect(await count(customers)).toBe(1)
    expect(await count(accessTokens)).toBe(1)
  })

  it("(b) another browser's session reusing a key gets a conflict and learns nothing", async () => {
    const key = randomUUID()
    const first = await placeOrder(db, input({ idempotencyKey: key }), ctx())
    const other = await placeOrder(db, input(), ctx())
    if (first.kind !== 'created' || other.kind !== 'created') throw new Error('setup')
    expect(await placeOrder(db, input({ idempotencyKey: key }), ctx(other.customerId))).toEqual({
      kind: 'rejected',
      reason: 'idempotency_conflict'
    })
  })

  it('(d) rejects an order after the cut-off by server time and writes nothing', async () => {
    const result = await placeOrder(db, input(), ctx(null, new Date(now.getTime() + 49 * HOUR)))
    expect(result).toEqual({ kind: 'rejected', reason: 'drop_closed' })
    expect(await count(orders)).toBe(0)
    expect(await count(customers)).toBe(0)
  })

  it('rejects an order that does not fit, with the spaces left, and writes nothing', async () => {
    const result = await placeOrder(db, input({ lines: [{ menuItemId: item330, quantity: 11 }] }), ctx())
    expect(result).toEqual({ kind: 'rejected', reason: 'not_enough_space', spacesLeft: 10 })
    expect(await count(orders)).toBe(0)
  })

  // Active holds are counted by the same dropUsage query; they are first created in C5 (pay-start).
  it('counts paid units in the advisory check, and a requested order reserves nothing', async () => {
    const first = await placeOrder(db, input(), ctx())
    if (first.kind !== 'created') throw new Error(first.kind)
    // A requested order (no hold) uses no capacity: 10 spaces are still free.
    const fits = await placeOrder(db, input({ lines: [{ menuItemId: item330, quantity: 10 }] }), ctx())
    expect(fits.kind).toBe('created')
    // Pretend the first order was paid: now only 7 spaces are left.
    await db.update(orders).set({ status: 'paid_confirmed', paidAt: now }).where(eq(orders.id, first.orderId))
    const tooMany = await placeOrder(db, input({ lines: [{ menuItemId: item330, quantity: 8 }] }), ctx())
    expect(tooMany).toEqual({ kind: 'rejected', reason: 'not_enough_space', spacesLeft: 7 })
  })

  it('(g) the same phone from two sessions creates two separate customers', async () => {
    const a = await placeOrder(db, input(), ctx())
    const b = await placeOrder(db, input(), ctx())
    if (a.kind !== 'created' || b.kind !== 'created') throw new Error('setup')
    expect(a.customerId).not.toBe(b.customerId)
    const rows = await db.select().from(customers)
    expect(rows).toHaveLength(2)
    expect(rows.every((c) => c.phone === '+233241234567')).toBe(true)
  })

  it("updates the session customer's name and phone instead of creating a new customer", async () => {
    const first = await placeOrder(db, input(), ctx())
    if (first.kind !== 'created') throw new Error(first.kind)
    const second = await placeOrder(db, input({ firstName: 'Ama', phone: '+233501112223' }), ctx(first.customerId))
    expect(second.kind).toBe('created')
    if (second.kind === 'created') expect(second.newSessionToken).toBeNull()
    const rows = await db.select().from(customers)
    expect(rows).toMatchObject([{ id: first.customerId, firstName: 'Ama', phone: '+233501112223' }])
  })

  it("BR-O8: a new order retires the session's older request on the same drop only", async () => {
    const old = await placeOrder(db, input(), ctx())
    if (old.kind !== 'created') throw new Error(old.kind)
    const elsewhere = await placeOrder(db, input({ dropId: otherDropId }), ctx(old.customerId))
    const stranger = await placeOrder(db, input(), ctx())
    const fresh = await placeOrder(db, input(), ctx(old.customerId, new Date(now.getTime() + HOUR)))
    if (elsewhere.kind !== 'created' || stranger.kind !== 'created' || fresh.kind !== 'created') throw new Error('setup')

    const status = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status
    expect(await status(old.orderId)).toBe('expired')
    expect(await status(elsewhere.orderId)).toBe('requested')
    expect(await status(stranger.orderId)).toBe('requested')
    expect(await status(fresh.orderId)).toBe('requested')
    const history = await db.select().from(orderHistory).where(eq(orderHistory.orderId, old.orderId))
    expect(history.map((h) => `${h.fromStatus}>${h.toStatus}:${h.actor}`)).toContain('requested>expired:system')
  })

  it('BR-O10: a session holds at most 3 open requests; re-ordering the same drop still works', async () => {
    const third = await makeDrop(10, new Date(now.getTime() + 120 * HOUR))
    const fourth = await makeDrop(10, new Date(now.getTime() + 144 * HOUR))
    const first = await placeOrder(db, input(), ctx())
    if (first.kind !== 'created') throw new Error(first.kind)
    const me = first.customerId
    expect((await placeOrder(db, input({ dropId: otherDropId }), ctx(me))).kind).toBe('created')
    expect((await placeOrder(db, input({ dropId: third }), ctx(me))).kind).toBe('created')

    const before = await count(orders)
    expect(await placeOrder(db, input({ dropId: fourth }), ctx(me))).toEqual({ kind: 'rejected', reason: 'too_many_open_requests' })
    expect(await count(orders)).toBe(before)
    // A new order on a drop that already has one retires the old request first (BR-O8), so it fits.
    expect((await placeOrder(db, input(), ctx(me))).kind).toBe('created')
  })

  it('rejects an unknown or inactive menu item', async () => {
    await db.update(menuItems).set({ active: false }).where(eq(menuItems.id, item500))
    expect(await placeOrder(db, input(), ctx())).toEqual({ kind: 'invalid', reason: 'invalid_item' })
  })

  it('flags rows as sample only in demo mode', async () => {
    const result = await placeOrder(db, input(), { now, sessionCustomerId: null, demoMode: false })
    if (result.kind !== 'created') throw new Error(result.kind)
    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId))
    const [customer] = await db.select().from(customers).where(eq(customers.id, result.customerId))
    expect(order!.isSample).toBe(false)
    expect(customer!.isSample).toBe(false)
  })
})
