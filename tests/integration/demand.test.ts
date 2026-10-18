// O1 demand service against the real *_test database (spec 5.9).
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { forecastSnapshots, settings } from '../../server/db/schema'
import { dropDemand } from '../../server/services/owner/demand'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { closedDropWithPayments, DAY, insertOrder, makeCustomer, makeDropAt, makeFlavour, turnAway } from './owner-fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-17T12:00:00Z')
const at = (days: number) => new Date(now.getTime() + days * DAY)
let item: string

beforeEach(async () => {
  await resetTestDatabase(client)
  item = await makeFlavour(db, 'Raw cane')
})

/**
 * Four ordinary closed drops of 40 units: 10 paid 4.5 days before cut-off, 10 at 2.5, 20 at 0.5.
 * So 25% is paid by 3 days before cut-off.
 */
async function fourOrdinaryDrops(unplanned: number[] = [10, 10, 10, 10]) {
  for (const [i, daysAgo] of [30, 25, 20, 15].entries()) {
    await closedDropWithPayments(db, {
      cutOffAt: at(-daysAgo),
      itemId: item,
      unplannedSold: unplanned[i],
      payments: [
        { daysBefore: 4.5, quantity: 10 },
        { daysBefore: 2.5, quantity: 10 },
        { daysBefore: 0.5, quantity: 20 }
      ]
    })
  }
}

/** An open drop 3 days before cut-off with 10 units paid so far. */
async function openDropWithTenPaid(cutOffInDays = 3) {
  const dropId = await makeDropAt(db, at(cutOffInDays))
  await insertOrder(db, { dropId, itemId: item, quantity: 10, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1) })
  return dropId
}

const demand = async (dropId: string) => (await dropDemand(db, dropId, { now, demoMode: false }))!

describe('O1 demand', () => {
  it('pace from history: 10 paid at a 25% share projects 40', async () => {
    await fourOrdinaryDrops()
    const d = await demand(await openDropWithTenPaid())
    expect(d.forecast).toMatchObject({ method: 'pace', projected: 40, pace: 40, baseline: 40, closedDrops: 4 })
    expect(d.forecast.range).toEqual({ low: 36, high: 44, fallback: true })
  })

  it('leaves a drop that hit capacity out of the pace table, but counts its turned-away demand', async () => {
    await fourOrdinaryDrops()
    // Capacity 30, all paid early, then 5 turned away. Its shape would pull the pace share up.
    const capped = await closedDropWithPayments(db, { cutOffAt: at(-10), itemId: item, capacity: 30, payments: [{ daysBefore: 4.5, quantity: 30 }] })
    await turnAway(db, capped, 5, null)
    const d = await demand(await openDropWithTenPaid())
    expect(d.forecast.pace).toBe(40)
    // Baseline over the last 4 (40, 40, 40, 35), weights 1 to 4: 380 / 10 = 38 (BR-FC1 uses 30 + 5).
    expect(d.forecast.baseline).toBe(38)
  })

  it('excludes lapsed requests from the likely tier and the by-flavour list', async () => {
    const ginger = await makeFlavour(db, 'Ginger-lemon cane')
    const dropId = await makeDropAt(db, at(3))
    await insertOrder(db, { dropId, itemId: item, quantity: 3, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1) })
    await insertOrder(db, { dropId, itemId: item, quantity: 2, status: 'requested', createdAt: at(-0.1) })
    await insertOrder(db, { dropId, itemId: ginger, quantity: 1, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1) })
    // Created 3 days ago with a 2-day expiry: lapsed.
    await insertOrder(db, { dropId, itemId: ginger, quantity: 5, status: 'requested', createdAt: at(-3) })

    const d = await demand(dropId)
    expect(d.units.openRequested).toBe(2)
    expect(d.units.conversion).toEqual({ rate: 0.7, fallback: true })
    expect(d.units.likely).toBe(1) // 2 x 0.7 = 1.4
    expect(d.byFlavour).toEqual([
      { flavour: 'Raw cane', paid: 3, likely: 1 },
      { flavour: 'Ginger-lemon cane', paid: 1, likely: 0 }
    ])
  })

  it('ignores turned-away rows whose customer later got a paid order on the drop (BR-F2)', async () => {
    const dropId = await makeDropAt(db, at(3))
    const keen = await makeCustomer(db)
    const other = await makeCustomer(db)
    const keenFirst = await insertOrder(db, { dropId, itemId: item, quantity: 3, status: 'cancelled', createdAt: at(-2), customerId: keen })
    await insertOrder(db, { dropId, itemId: item, quantity: 1, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1), customerId: keen })
    const otherOrder = await insertOrder(db, { dropId, itemId: item, quantity: 2, status: 'requested', createdAt: at(-1), customerId: other })
    await turnAway(db, dropId, 3, keenFirst)
    await turnAway(db, dropId, 2, otherOrder)
    await turnAway(db, dropId, 4, null)

    expect((await demand(dropId)).units.turnedAway).toBe(6)
  })

  it('each buffer setting changes suggested production', async () => {
    await fourOrdinaryDrops([8, 12, 16, 10])
    const dropId = await openDropWithTenPaid()
    const suggestedWith = async (setting: string) => {
      await db.insert(settings).values({ key: 'buffer_setting', value: setting }).onConflictDoUpdate({ target: settings.key, set: { value: setting } })
      const d = await demand(dropId)
      return [d.unplannedBuffer.units, d.suggested, d.unplannedBuffer.lowConfidence]
    }
    expect(await suggestedWith('careful')).toEqual([8, 48, false])
    expect(await suggestedWith('balanced')).toEqual([12, 52, false]) // average 11.5 rounds to 12
    expect(await suggestedWith('never_sell_out')).toEqual([16, 56, false])
  })

  it('writes the checkpoint snapshot once, as of the nominal checkpoint, and none before it', async () => {
    await fourOrdinaryDrops()
    const pastCheckpoint = await openDropWithTenPaid(2) // checkpoint was 1 day ago
    const beforeCheckpoint = await makeDropAt(db, at(5))

    await demand(pastCheckpoint)
    const first = await db.select().from(forecastSnapshots).where(eq(forecastSnapshots.dropId, pastCheckpoint))
    await demand(pastCheckpoint)
    const second = await db.select().from(forecastSnapshots).where(eq(forecastSnapshots.dropId, pastCheckpoint))

    expect(first.map((s) => s.method).sort()).toEqual(['baseline', 'pace'])
    expect(second).toEqual(first)
    expect(first.every((s) => s.checkpointAt.getTime() === at(-1).getTime())).toBe(true)
    // The 10 units were paid 1 day ago, exactly at the checkpoint: 10 / 0.25 = 40.
    expect(first.find((s) => s.method === 'pace')?.projectedUnits).toBe(40)
    expect(await db.select().from(forecastSnapshots).where(eq(forecastSnapshots.dropId, beforeCheckpoint))).toEqual([])
  })

  it('with no history: baseline unavailable, buffer at the low-confidence sample default', async () => {
    const d = await demand(await openDropWithTenPaid())
    expect(d.forecast).toMatchObject({ method: 'none', projected: null, range: null, closedDrops: 0 })
    expect(d.unplannedBuffer).toMatchObject({ units: 10, lowConfidence: true })
    expect(d.suggested).toBeNull()
    expect(d.plannedShare).toBeNull()
  })
})
