// "Delete my data now" against the real *_test database (BR-DP2): fields cleared, orders kept
// anonymised, tokens and queued reminders gone, consent proof kept, safe to run twice.
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { accessTokens, consentEvents, customers, orders, reminders } from '../../server/db/schema'
import { createSession, issueLink, redeemLink } from '../../server/services/links'
import { optIn, optOut } from '../../server/services/reminders'
import { applyPurge } from '../../server/services/retention'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, MIN, requestedOrder } from './fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-19T12:00:00Z')
const later = new Date(now.getTime() + 10 * MIN)
let customerId: string
let orderId: string
let dropId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  dropId = await makeDrop(db, 10, new Date(now.getTime() + 48 * HOUR))
  const itemId = await makeItem(db)
  ;({ customerId, orderId } = await requestedOrder(db, dropId, itemId, 1, now))
  await db.update(orders).set({ fulfilment: 'delivery', address: '12 Sample Street', area: 'Sample area A' }).where(eq(orders.id, orderId))
})

describe('applyPurge (BR-DP2)', () => {
  it('clears the customer, keeps the order anonymised, deletes tokens and queued reminders', async () => {
    await issueLink(db, customerId, now, true)
    await createSession(db, customerId, now, true)
    await optIn(db, customerId, { channel: 'whatsapp', frequency: 'every_drop', source: 'c6' }, { now, demoMode: true })
    // One reminder per customer per drop (BR-R5): the sent one is for an earlier drop.
    const earlierDrop = await makeDrop(db, 10, new Date(now.getTime() - 48 * HOUR))
    await db.insert(reminders).values([
      { customerId, dropId, channel: 'whatsapp', status: 'queued' },
      { customerId, dropId: earlierDrop, channel: 'whatsapp', status: 'sent', sentAt: now }
    ])

    await db.transaction((tx) => applyPurge(tx, customerId, later))

    const [c] = await db.select().from(customers).where(eq(customers.id, customerId))
    expect(c).toMatchObject({ firstName: null, phone: null, reminderChannel: null, reminderFrequency: null, deletedAt: later })
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(o).toMatchObject({ customerId: null, address: null, area: 'Sample area A', totalPesewas: expect.any(Number) })
    expect(await db.select().from(accessTokens).where(eq(accessTokens.customerId, customerId))).toEqual([])
    const left = await db.select().from(reminders).where(eq(reminders.customerId, customerId))
    expect(left.map((r) => r.status)).toEqual(['sent'])
    // Proof of consent is kept.
    expect(await db.select().from(consentEvents).where(eq(consentEvents.customerId, customerId))).toHaveLength(1)
  })

  it('makes every link and session stop working', async () => {
    const link = await issueLink(db, customerId, now, true)
    expect(await redeemLink(db, link, now, true)).not.toBeNull()
    await db.transaction((tx) => applyPurge(tx, customerId, later))
    expect(await redeemLink(db, link, later, true)).toBeNull()
  })

  it('is safe to run twice: nothing changes the second time', async () => {
    await db.transaction((tx) => applyPurge(tx, customerId, later))
    const [first] = await db.select().from(customers).where(eq(customers.id, customerId))
    await db.transaction((tx) => applyPurge(tx, customerId, new Date(later.getTime() + HOUR)))
    const [second] = await db.select().from(customers).where(eq(customers.id, customerId))
    expect(second).toEqual(first)
  })

  it('consent cannot be changed for a deleted customer', async () => {
    await db.transaction((tx) => applyPurge(tx, customerId, later))
    expect((await optOut(db, customerId, { choice: 'none', source: 'c9' }, { now: later, demoMode: true })).kind).toBe('not_found')
  })
})
