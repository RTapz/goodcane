// pnpm seed against the real *_test database (spec section 9): smoke test leftovers are removed,
// other data survives, and the live drop always comes back at about 30 paid and 10 requested units.
import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../../server/db/client'
import {
  accessTokens,
  consentEvents,
  customers,
  drops,
  menuItems,
  orderHistory,
  orders,
  payments
} from '../../server/db/schema'
import { runSeed } from '../../server/db/seed/run'
import { SMOKE_FIRST_NAME, SMOKE_PHONE } from '../../server/db/seed/smoke-marker'
import { LIVE_PAID_UNITS, verifySeed } from '../../server/db/seed/verify'
import { DEMO_CUSTOMER_NAME, DEMO_CUSTOMER_TOKEN } from '../../server/domain/identity/demo-customer'
import { dropUsage } from '../../server/services/capacity'
import { redeemLink } from '../../server/services/links'
import { applyPurge } from '../../server/services/retention'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { insertOrder } from './owner-fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-19T10:00:00Z')
const seed = () => db.transaction((tx) => runSeed(tx, now))

async function liveDrop() {
  const [drop] = await db
    .select({ id: drops.id })
    .from(drops)
    .where(and(eq(drops.status, 'open'), gt(drops.cutOffAt, now)))
    .orderBy(asc(drops.dropAt))
    .limit(1)
  return drop!.id
}

async function anyItem() {
  const [item] = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.size, '330ml')).limit(1)
  return item!.id
}

/** What a smoke run against a deployment outside demo mode leaves: unflagged rows on the live drop. */
async function smokeLeftovers(dropId: string, itemId: string) {
  const [smoke] = await db
    .insert(customers)
    .values({ firstName: SMOKE_FIRST_NAME, phone: SMOKE_PHONE })
    .returning({ id: customers.id })
  const orderId = await insertOrder(db, {
    dropId,
    itemId,
    quantity: 1,
    status: 'paid_confirmed',
    createdAt: now,
    paidAt: now,
    customerId: smoke!.id
  })
  await db.insert(payments).values({ orderId, reference: 'SMOKE-test-1', outcome: 'success', result: 'confirmed' })
  await db.insert(orderHistory).values({ orderId, fromStatus: 'requested', toStatus: 'paid_confirmed', actor: 'system' })
  await db.insert(accessTokens).values({ customerId: smoke!.id, kind: 'session', tokenHash: 'smoke-session-hash' })
  await db.insert(consentEvents).values({ customerId: smoke!.id, action: 'opt_out', channel: 'none', source: 'c6' })
  // A second smoke customer with nothing else, as a failed run might leave.
  const [bare] = await db
    .insert(customers)
    .values({ firstName: SMOKE_FIRST_NAME, phone: SMOKE_PHONE })
    .returning({ id: customers.id })
  return { smokeIds: [smoke!.id, bare!.id], orderId }
}

async function liveUnits(dropId: string) {
  return (await dropUsage(db, [dropId], now)).get(dropId)!
}

beforeEach(async () => {
  await resetTestDatabase(client)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('pnpm seed cleanup', () => {
  it('removes smoke test customers and their rows, flagged or not, and keeps other customers', async () => {
    await seed()
    const dropId = await liveDrop()
    const itemId = await anyItem()
    const { smokeIds, orderId } = await smokeLeftovers(dropId, itemId)
    const [other] = await db
      .insert(customers)
      .values({ firstName: 'Someone else', phone: '+233200000123' })
      .returning({ id: customers.id })

    await seed()

    expect(await db.select().from(customers).where(inArray(customers.id, smokeIds))).toEqual([])
    expect(await db.select().from(orders).where(eq(orders.id, orderId))).toEqual([])
    expect(await db.select().from(payments).where(eq(payments.reference, 'SMOKE-test-1'))).toEqual([])
    expect(await db.select().from(accessTokens).where(eq(accessTokens.tokenHash, 'smoke-session-hash'))).toEqual([])
    expect(await db.select().from(consentEvents).where(eq(consentEvents.isSample, false))).toEqual([])
    expect(await db.select().from(customers).where(eq(customers.id, other!.id))).toHaveLength(1)
  })

  it('brings a full live drop back to about 30 paid and 10 requested units', async () => {
    await seed()
    const dropId = await liveDrop()
    const itemId = await anyItem()
    // Fill it to capacity with unflagged paid orders, like many smoke runs and demo walk-throughs.
    const { confirmedUnits } = await liveUnits(dropId)
    await insertOrder(db, { dropId, itemId, quantity: 70 - confirmedUnits, status: 'paid_confirmed', createdAt: now, paidAt: now })
    expect((await liveUnits(dropId)).confirmedUnits).toBe(70)

    await seed()

    const { confirmedUnits: paid, heldUnits } = await liveUnits(await liveDrop())
    expect(paid).toBeGreaterThanOrEqual(LIVE_PAID_UNITS.min)
    expect(paid).toBeLessThanOrEqual(LIVE_PAID_UNITS.max)
    expect(heldUnits).toBe(0)
    expect(70 - paid).toBeGreaterThan(0)
  })

  it('verification rejects a live drop with no spaces left', async () => {
    await seed()
    const dropId = await liveDrop()
    const { confirmedUnits } = await liveUnits(dropId)
    await insertOrder(db, { dropId, itemId: await anyItem(), quantity: 70 - confirmedUnits, status: 'paid_confirmed', createdAt: now, paidAt: now })

    await expect(db.transaction((tx) => verifySeed(tx, now))).rejects.toThrow(/no spaces left/)
  })

  it('verification rejects an empty reminder queue for the live drop', async () => {
    await seed()
    await db.update(customers).set({ reminderChannel: null, reminderFrequency: null })
    await expect(db.transaction((tx) => verifySeed(tx, now))).rejects.toThrow(/reminder queue/)
  })

  it('Demo Customer A: only in demo mode, its fixed link opens a returning customer, and a reseed brings it back', async () => {
    // Demo mode off: no Demo Customer A and no fixed link.
    await seed()
    expect(await db.select().from(customers).where(eq(customers.firstName, DEMO_CUSTOMER_NAME))).toEqual([])
    expect(await redeemLink(db, DEMO_CUSTOMER_TOKEN, now, true)).toBeNull()

    // Demo mode on: the link works and lands a customer with a paid order.
    await db.transaction((tx) => runSeed(tx, now, { demoMode: true }))
    const opened = await redeemLink(db, DEMO_CUSTOMER_TOKEN, now, true)
    expect(opened?.latestPaidOrderId).toEqual(expect.any(String))

    // "Delete my data now" kills the link until the next reseed.
    await db.transaction((tx) => applyPurge(tx, opened!.customerId, now))
    expect(await redeemLink(db, DEMO_CUSTOMER_TOKEN, now, true)).toBeNull()
    await db.transaction((tx) => runSeed(tx, now, { demoMode: true }))
    expect(await redeemLink(db, DEMO_CUSTOMER_TOKEN, now, true)).not.toBeNull()
  })

  it('verification accepts the freshly seeded live drop', async () => {
    await seed()
    await expect(db.transaction((tx) => verifySeed(tx, now))).resolves.toBeUndefined()
  })
})
