// pnpm retention (BR-DP1, BR-DP3) against the real *_test database: who is selected, a dry run
// changes nothing, a real run purges, a second run purges nobody, and opening a link is not activity.
import { eq, isNotNull } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { customers, orders, settings } from '../../server/db/schema'
import { settingsDefaults } from '../../server/db/settings-defaults'
import { issueLink, redeemLink } from '../../server/services/links'
import { applyPurge, findInactiveCustomers, purgeInactiveCustomers } from '../../server/services/retention'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { DAY, insertOrder, makeDropAt, makeFlavour } from './owner-fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-22T12:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * DAY)
let inactive: string
let active: string
let alreadyDeleted: string

async function customer(name: string, lastActiveAt: Date) {
  const [row] = await db.insert(customers).values({ firstName: name, phone: '+233200000301', lastActiveAt }).returning({ id: customers.id })
  return row!.id
}

beforeEach(async () => {
  await resetTestDatabase(client)
  await db.insert(settings).values(Object.entries(settingsDefaults).map(([key, value]) => ({ key, value })))
  inactive = await customer('Old', ago(200)) // more than 6 months
  active = await customer('Recent', ago(30))
  alreadyDeleted = await customer('Gone', ago(400))
  await db.transaction((tx) => applyPurge(tx, alreadyDeleted, ago(300)))
  // The inactive customer has an order, which must survive anonymised.
  const dropId = await makeDropAt(db, ago(210))
  await insertOrder(db, { dropId, itemId: await makeFlavour(db, 'Raw cane'), quantity: 1, status: 'fulfilled', createdAt: ago(215), paidAt: ago(215), customerId: inactive })
})

describe('pnpm retention (BR-DP1, BR-DP3)', () => {
  it('selects only customers inactive for longer than the retention period and not already deleted', async () => {
    expect(await findInactiveCustomers(db, now)).toEqual([inactive])
  })

  it('a dry run counts and changes nothing', async () => {
    expect(await purgeInactiveCustomers(db, now, { dryRun: true })).toEqual({ inactive: 1, purged: 0 })
    expect((await db.select().from(customers).where(eq(customers.id, inactive)))[0]).toMatchObject({ firstName: 'Old', deletedAt: null })
  })

  it('a real run purges them, keeps their orders anonymised, and a second run purges nobody', async () => {
    expect(await purgeInactiveCustomers(db, now, { dryRun: false })).toEqual({ inactive: 1, purged: 1 })
    expect((await db.select().from(customers).where(eq(customers.id, inactive)))[0]).toMatchObject({ firstName: null, phone: null, deletedAt: now })
    expect(await db.select().from(orders).where(isNotNull(orders.customerId))).toEqual([])
    expect((await db.select().from(customers).where(eq(customers.id, active)))[0]).toMatchObject({ firstName: 'Recent' })
    expect(await purgeInactiveCustomers(db, now, { dryRun: false })).toEqual({ inactive: 0, purged: 0 })
  })

  it('opening a private link does not count as activity (BR-DP1)', async () => {
    const link = await issueLink(db, inactive, ago(1), true)
    expect(await redeemLink(db, link, now, true)).not.toBeNull()
    expect((await db.select().from(customers).where(eq(customers.id, inactive)))[0]!.lastActiveAt).toEqual(ago(200))
    expect(await findInactiveCustomers(db, now)).toEqual([inactive])
  })
})
