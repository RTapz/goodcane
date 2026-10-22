// BR-F2 for a completely full drop, against the real *_test database: one drop_full row per key,
// nothing else created, refusals, and the forecast's dedupe still leaving out a later payer.
import { eq, isNotNull, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type Db } from '../../server/db/client'
import { customers, orders, settings, turnedAway } from '../../server/db/schema'
import { settingsDefaults } from '../../server/db/settings-defaults'
import { recordTurnedAway } from '../../server/services/orders/turned-away'
import { dropDemand } from '../../server/services/owner/demand'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { DAY, insertOrder, makeDropAt, makeFlavour } from './owner-fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-22T12:00:00Z')
const at = (days: number) => new Date(now.getTime() + days * DAY)
let fullDrop: string
let itemId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  await db.insert(settings).values(Object.entries(settingsDefaults).map(([key, value]) => ({ key, value })))
  itemId = await makeFlavour(db, 'Raw cane')
  // Capacity 2, both paid: completely full.
  fullDrop = await makeDropAt(db, at(2), { capacity: 2 })
  await insertOrder(db, { dropId: fullDrop, itemId, quantity: 2, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1) })
})

const record = (args: Partial<{ dropId: string; units: number; idempotencyKey: string; customerId: string | null }>, when = now) =>
  recordTurnedAway(
    db,
    { dropId: fullDrop, units: 3, idempotencyKey: 'key-1', customerId: null, ...args },
    { now: when, demoMode: true }
  )
const count = async (table: typeof turnedAway | typeof orders | typeof customers) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n
/** Orders holding spaces. */
const holdsCheck = async (d: Db) =>
  (await d.select({ n: sql<number>`count(*)::int` }).from(orders).where(isNotNull(orders.holdExpiresAt)))[0]!.n

describe('recordTurnedAway (BR-F2, drop_full)', () => {
  it('writes one drop_full row and creates no order, hold or customer', async () => {
    const before = { orders: await count(orders), customers: await count(customers) }
    expect(await record({})).toEqual({ kind: 'recorded' })
    const rows = await db.select().from(turnedAway)
    expect(rows).toEqual([
      expect.objectContaining({ dropId: fullDrop, units: 3, reason: 'drop_full', orderId: null, customerId: null, idempotencyKey: 'key-1', isSample: true })
    ])
    expect(await count(orders)).toBe(before.orders)
    expect(await count(customers)).toBe(before.customers)
    expect(await holdsCheck(db)).toBe(0)
  })

  it('a repeated key writes nothing more, even with different units', async () => {
    await record({})
    expect(await record({ units: 5 })).toEqual({ kind: 'replayed' })
    expect(await count(turnedAway)).toBe(1)
    expect((await db.select().from(turnedAway))[0]).toMatchObject({ units: 3 })
  })

  it('refuses a drop with room, a closed drop and a drop past cut-off, writing nothing', async () => {
    const roomy = await makeDropAt(db, at(2.1), { capacity: 70 })
    expect(await record({ dropId: roomy })).toEqual({ kind: 'refused', reason: 'has_space' })
    expect(await record({}, at(2))).toEqual({ kind: 'refused', reason: 'drop_closed' })
    const closed = await makeDropAt(db, at(2.2), { capacity: 2, status: 'closed' })
    expect(await record({ dropId: closed })).toEqual({ kind: 'refused', reason: 'drop_closed' })
    expect(await record({ dropId: '00000000-0000-4000-8000-000000000000' })).toEqual({ kind: 'refused', reason: 'unknown_drop' })
    expect(await count(turnedAway)).toBe(0)
  })

  it('wanting more than the spaces left counts as full for those units', async () => {
    const oneLeft = await makeDropAt(db, at(2.3), { capacity: 3 })
    await insertOrder(db, { dropId: oneLeft, itemId, quantity: 2, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1) })
    expect(await record({ dropId: oneLeft, units: 1, idempotencyKey: 'k-a' })).toEqual({ kind: 'refused', reason: 'has_space' })
    expect(await record({ dropId: oneLeft, units: 2, idempotencyKey: 'k-b' })).toEqual({ kind: 'recorded' })
  })
})

describe('the forecast still counts each person once (BR-F2 dedupe)', () => {
  it('leaves out a session customer who later paid on the same drop, and keeps an anonymous row', async () => {
    const [ama] = await db.insert(customers).values({ firstName: 'Ama', phone: '+233200000201' }).returning({ id: customers.id })
    await record({ units: 4, idempotencyKey: 'ama-key', customerId: ama!.id })
    await record({ units: 3, idempotencyKey: 'anon-key', customerId: null })
    const demand = async () => (await dropDemand(db, fullDrop, { now, demoMode: false }))!.units.turnedAway
    expect(await demand()).toBe(7)
    // A space frees up and Ama pays on the same drop: her turned-away units are already in paid.
    await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.dropId, fullDrop))
    await insertOrder(db, { dropId: fullDrop, itemId, quantity: 1, status: 'paid_confirmed', createdAt: now, paidAt: now, customerId: ama!.id })
    expect(await demand()).toBe(3)
  })
})
