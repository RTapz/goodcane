// O3 Close batch against the real *_test database (spec 5.10, BR-B1 to B4).
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { drops, settings } from '../../server/db/schema'
import { settingsDefaults } from '../../server/db/settings-defaults'
import { closeDrop, closeInfo } from '../../server/services/owner/close-batch'
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
let item: string
let pastDrop: string

beforeEach(async () => {
  await resetTestDatabase(client)
  await db.insert(settings).values(Object.entries(settingsDefaults).map(([key, value]) => ({ key, value })))
  item = await makeFlavour(db, 'Raw cane')
  // Cut-off yesterday: ready to close. 10 paid units (6 fulfilled, 4 paid), plus a request that does not count.
  pastDrop = await makeDropAt(db, at(-1))
  await insertOrder(db, { dropId: pastDrop, itemId: item, quantity: 6, status: 'fulfilled', createdAt: at(-3), paidAt: at(-3) })
  await insertOrder(db, { dropId: pastDrop, itemId: item, quantity: 4, status: 'paid_confirmed', createdAt: at(-2), paidAt: at(-2) })
  await insertOrder(db, { dropId: pastDrop, itemId: item, quantity: 3, status: 'requested', createdAt: at(-2) })
})

const close = (dropId: string, input: { unitsMade: number; unplannedSold: number; wasted?: number | null }, demoMode = false, when = now) =>
  closeDrop(db, dropId, input, { now: when, demoMode })
const row = async (id: string) => (await db.select().from(drops).where(eq(drops.id, id)))[0]!

describe('closeDrop (BR-B1 to B4)', () => {
  it('orders sold is the paid units; wasted is calculated; the drop becomes completed with closed_at', async () => {
    expect((await closeInfo(db, pastDrop, { now, demoMode: false }))!).toMatchObject({ ordersSold: 10, mode: { ok: true, mode: 'after_cut_off' } })
    expect(await close(pastDrop, { unitsMade: 25, unplannedSold: 12 })).toEqual({
      kind: 'closed',
      ordersSold: 10,
      unitsMade: 25,
      unplannedSold: 12,
      wasted: 3,
      warning: null
    })
    expect(await row(pastDrop)).toMatchObject({ status: 'completed', unitsMade: 25, unplannedSold: 12, unitsWasted: 3, closedAt: now })
  })

  it('stores the numbers and returns a non-blocking warning when the identity fails', async () => {
    const result = await close(pastDrop, { unitsMade: 30, unplannedSold: 12, wasted: 5 })
    expect(result).toMatchObject({ kind: 'closed', wasted: 5, warning: { difference: 3 } })
    expect(await row(pastDrop)).toMatchObject({ status: 'completed', unitsMade: 30, unitsWasted: 5 })
  })

  it('refuses a calculated wasted below zero and writes nothing', async () => {
    expect(await close(pastDrop, { unitsMade: 15, unplannedSold: 12 })).toEqual({ kind: 'refused', reason: 'negative_wasted' })
    expect(await row(pastDrop)).toMatchObject({ status: 'open', unitsMade: null, closedAt: null })
  })

  it('is idempotent: a second close returns the stored numbers and changes nothing', async () => {
    await close(pastDrop, { unitsMade: 25, unplannedSold: 12 })
    const second = await close(pastDrop, { unitsMade: 99, unplannedSold: 1 }, false, at(1))
    expect(second).toEqual({ kind: 'already_closed', ordersSold: 10, unitsMade: 25, unplannedSold: 12, wasted: 3 })
    expect(await row(pastDrop)).toMatchObject({ unitsMade: 25, unplannedSold: 12, unitsWasted: 3, closedAt: now })
  })

  it('before the cut-off: refused outside demo mode; in demo mode allowed while another open drop remains', async () => {
    const live = await makeDropAt(db, at(2))
    expect(await close(live, { unitsMade: 0, unplannedSold: 0 })).toEqual({ kind: 'refused', reason: 'not_past_cut_off' })
    // The live drop is the only open drop still taking orders: demo early close is refused too.
    expect(await close(live, { unitsMade: 0, unplannedSold: 0 }, true)).toEqual({ kind: 'refused', reason: 'last_open_drop' })
    expect((await closeInfo(db, live, { now, demoMode: true }))!.mode).toEqual({ ok: false, reason: 'last_open_drop' })
    // With a further open drop, demo mode allows it.
    await makeDropAt(db, at(6))
    expect((await closeInfo(db, live, { now, demoMode: true }))!.mode).toEqual({ ok: true, mode: 'demo_early' })
    expect(await close(live, { unitsMade: 4, unplannedSold: 4 }, true)).toMatchObject({ kind: 'closed', wasted: 0 })
    expect(await row(live)).toMatchObject({ status: 'completed' })
  })

  it('feeds the exact planned share on O1 (BR-FC12)', async () => {
    await close(pastDrop, { unitsMade: 25, unplannedSold: 10 })
    const demand = (await dropDemand(db, pastDrop, { now, demoMode: false }))!
    expect(demand.plannedShare).toMatchObject({ kind: 'exact', preordered: 10, unplanned: 10, share: 0.5 })
  })

  it('an unknown drop is not found', async () => {
    expect(await close('00000000-0000-4000-8000-000000000000', { unitsMade: 1, unplannedSold: 0 })).toEqual({ kind: 'not_found' })
  })
})
