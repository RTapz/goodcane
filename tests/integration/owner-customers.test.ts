// O7 against the real *_test database: masked phones only, search by first name, and
// "Send new link" (BR-L6) that revokes the old link and never shows an earlier token.
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { accessTokens, customers } from '../../server/db/schema'
import { issueLink, redeemLink } from '../../server/services/links'
import { listOwnerCustomers, sendNewLink } from '../../server/services/owner/customers'
import { applyPurge } from '../../server/services/retention'
import { hashToken } from '../../server/services/tokens'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, requestedOrder } from './fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-19T12:00:00Z')
let customerId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  const dropId = await makeDrop(db, 10, new Date(now.getTime() + 48 * HOUR))
  customerId = (await requestedOrder(db, dropId, await makeItem(db), 1, now)).customerId
  await db.update(customers).set({ firstName: 'Ama' }).where(eq(customers.id, customerId))
})

describe('O7 customers list', () => {
  it('shows masked phones only, searches by first name, and carries no token of any kind', async () => {
    await issueLink(db, customerId, now, true)
    const rows = await listOwnerCustomers(db, 'am')
    expect(rows).toEqual([{ id: customerId, firstName: 'Ama', maskedPhone: expect.stringMatching(/001$/), lastActiveAt: expect.any(String) }])
    const text = JSON.stringify(rows)
    expect(text).not.toContain('+233200000001')
    expect(text).not.toMatch(/token|hash/i)
    expect(await listOwnerCustomers(db, 'kofi')).toEqual([])
  })

  it('leaves out deleted customers', async () => {
    await db.transaction((tx) => applyPurge(tx, customerId, now))
    expect(await listOwnerCustomers(db, '')).toEqual([])
  })
})

describe('Send new link (BR-L6)', () => {
  it('creates a new link, revokes the old one, and returns only the new raw token', async () => {
    const old = await issueLink(db, customerId, now, true)
    const result = await sendNewLink(db, customerId, now, true)
    expect(result).not.toBeNull()
    expect(result!.token).not.toBe(old)
    expect(await redeemLink(db, old, now, true)).toBeNull()
    expect(await redeemLink(db, result!.token, now, true)).not.toBeNull()
    // Only hashes are stored; the old raw value is nowhere to be had.
    const rows = await db.select().from(accessTokens).where(eq(accessTokens.customerId, customerId))
    expect(rows.some((r) => r.tokenHash === old)).toBe(false)
    expect(rows.find((r) => r.tokenHash === hashToken(old))?.revokedAt).toEqual(now)
  })

  it('refuses a deleted or unknown customer', async () => {
    await db.transaction((tx) => applyPurge(tx, customerId, now))
    expect(await sendNewLink(db, customerId, now, true)).toBeNull()
    expect(await sendNewLink(db, '00000000-0000-4000-8000-000000000000', now, true)).toBeNull()
  })
})
