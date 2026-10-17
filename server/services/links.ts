// Private links (BR-L1 to BR-L4, BR-L10) and the sessions they create.
// Only SHA-256 hashes are stored; a raw token exists only in the response that creates it.
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbOrTx } from '../db/client'
import { accessTokens, customers, orders } from '../db/schema'
import { generateToken, hashToken, SESSION_DAYS } from './tokens'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Creates a session token for this customer and returns its raw value (for the cookie). */
export async function createSession(db: DbOrTx, customerId: string, now: Date, demoMode: boolean): Promise<string> {
  const raw = generateToken()
  await db.insert(accessTokens).values({
    customerId,
    kind: 'session',
    tokenHash: hashToken(raw),
    expiresAt: new Date(now.getTime() + SESSION_DAYS * MS_PER_DAY),
    isSample: demoMode
  })
  return raw
}

export async function hasActiveLink(db: DbOrTx, customerId: string): Promise<boolean> {
  const [link] = await db
    .select({ id: accessTokens.id })
    .from(accessTokens)
    .where(and(eq(accessTokens.customerId, customerId), eq(accessTokens.kind, 'link'), isNull(accessTokens.revokedAt)))
    .limit(1)
  return !!link
}

/** A new private link for the customer. Any earlier link is revoked (BR-L10). No expiry (BR-L1). */
export async function issueLink(db: DbOrTx, customerId: string, now: Date, demoMode: boolean): Promise<string> {
  await db
    .update(accessTokens)
    .set({ revokedAt: now })
    .where(and(eq(accessTokens.customerId, customerId), eq(accessTokens.kind, 'link'), isNull(accessTokens.revokedAt)))
  const raw = generateToken()
  await db.insert(accessTokens).values({
    customerId,
    kind: 'link',
    tokenHash: hashToken(raw),
    expiresAt: null,
    isSample: demoMode
  })
  return raw
}

/**
 * Opening a private link (BR-L3): checks the hash, revocation and expiry, and that the customer
 * still exists, then creates a session. Returns where to land: the latest paid order, if any.
 */
export async function redeemLink(db: Db, raw: string, now: Date, demoMode: boolean) {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .select({ customerId: accessTokens.customerId })
      .from(accessTokens)
      .innerJoin(customers, eq(customers.id, accessTokens.customerId))
      .where(
        and(
          eq(accessTokens.tokenHash, hashToken(raw)),
          eq(accessTokens.kind, 'link'),
          isNull(accessTokens.revokedAt),
          or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
          isNull(customers.deletedAt)
        )
      )
    if (!link) return null

    const sessionToken = await createSession(tx, link.customerId, now, demoMode)
    await tx.update(customers).set({ lastActiveAt: now }).where(eq(customers.id, link.customerId))
    const [latest] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.customerId, link.customerId), inArray(orders.status, ['paid_confirmed', 'fulfilled'])))
      .orderBy(desc(orders.paidAt))
      .limit(1)
    return { customerId: link.customerId, sessionToken, latestPaidOrderId: latest?.id ?? null }
  })
}

/** Whether the customer has at least one paid order (needed before making a new link). */
export async function hasPaidOrder(db: DbOrTx, customerId: string): Promise<boolean> {
  const [paid] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), inArray(orders.status, ['paid_confirmed', 'fulfilled'])))
    .limit(1)
  return !!paid
}
