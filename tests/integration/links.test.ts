// Private links (BR-L1 to BR-L4, BR-L10) against the real *_test database.
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { accessTokens } from '../../server/db/schema'
import { issueLink, redeemLink } from '../../server/services/links'
import { payStart } from '../../server/services/orders/pay-start'
import { simulatePayment } from '../../server/services/payments/simulate'
import { hashToken } from '../../server/services/tokens'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, MIN, requestedOrder } from './fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-17T12:00:00Z')
let paid: { orderId: string; customerId: string; link: string }

beforeEach(async () => {
  await resetTestDatabase(client)
  const dropId = await makeDrop(db, 10, new Date(now.getTime() + 48 * HOUR))
  const itemId = await makeItem(db)
  const order = await requestedOrder(db, dropId, itemId, 2, now)
  await payStart(db, order.orderId, { now, customerId: order.customerId, demoMode: true })
  const result = await simulatePayment(
    db,
    { orderId: order.orderId, reference: 'TEST-LINK-0001', outcome: 'success' },
    { now: new Date(now.getTime() + MIN), customerId: order.customerId, demoMode: true }
  )
  if (result.kind !== 'processed' || !result.privateLinkToken) throw new Error('setup: no link issued')
  paid = { ...order, link: result.privateLinkToken }
})

const links = () =>
  db.select().from(accessTokens).where(and(eq(accessTokens.kind, 'link'), eq(accessTokens.customerId, paid.customerId)))

describe('private link', () => {
  it('is stored only as a SHA-256 hash, with no expiry', async () => {
    const [row] = await links()
    expect(row!.tokenHash).toBe(hashToken(paid.link))
    expect(row!.tokenHash).not.toContain(paid.link)
    expect(row!.expiresAt).toBeNull()
  })

  it('logs in every time it is opened, each time with a new session (reusable, BR-L1)', async () => {
    const first = await redeemLink(db, paid.link, now, true)
    const second = await redeemLink(db, paid.link, now, true)
    expect(first).toMatchObject({ customerId: paid.customerId, latestPaidOrderId: paid.orderId })
    expect(second?.customerId).toBe(paid.customerId)
    expect(first!.sessionToken).not.toBe(second!.sessionToken)
    const sessions = await db
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.kind, 'session'), eq(accessTokens.customerId, paid.customerId)))
    // One from placing the order, two from opening the link.
    expect(sessions).toHaveLength(3)
  })

  it('is not issued again on a later payment', async () => {
    const all = await links()
    expect(all).toHaveLength(1)
  })

  it('a new link revokes the old one (BR-L10)', async () => {
    const fresh = await issueLink(db, paid.customerId, now, true)
    expect(await redeemLink(db, paid.link, now, true)).toBeNull()
    expect((await redeemLink(db, fresh, now, true))?.customerId).toBe(paid.customerId)
    const active = await db
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.kind, 'link'), isNull(accessTokens.revokedAt)))
    expect(active).toHaveLength(1)
  })

  it('an unknown link opens nothing', async () => {
    expect(await redeemLink(db, 'x'.repeat(43), now, true)).toBeNull()
  })
})
