// The browser session cookie (BR-L3): HttpOnly, SameSite=Lax, Secure outside dev, sliding 90 days.
// The cookie holds the raw token; the database holds only its SHA-256 hash.
import type { H3Event } from 'h3'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { accessTokens, customers } from '../db/schema'
import { hashToken, SESSION_DAYS } from '../services/tokens'

const COOKIE_NAME = 'gc_session'
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function setSessionCookie(event: H3Event, rawToken: string) {
  setCookie(event, COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60
  })
}

/** The customer behind a valid session cookie, or null. Slides the expiry at most once a day. */
export async function getSessionCustomerId(event: H3Event, now = new Date()): Promise<string | null> {
  const raw = getCookie(event, COOKIE_NAME)
  if (!raw) return null

  const db = useDb()
  const [session] = await db
    .select({ id: accessTokens.id, customerId: accessTokens.customerId, expiresAt: accessTokens.expiresAt })
    .from(accessTokens)
    .innerJoin(customers, eq(customers.id, accessTokens.customerId))
    .where(
      and(
        eq(accessTokens.tokenHash, hashToken(raw)),
        eq(accessTokens.kind, 'session'),
        isNull(accessTokens.revokedAt),
        gt(accessTokens.expiresAt, now),
        isNull(customers.deletedAt)
      )
    )
  if (!session) return null

  const fullExpiry = new Date(now.getTime() + SESSION_DAYS * MS_PER_DAY)
  if (!session.expiresAt || fullExpiry.getTime() - session.expiresAt.getTime() > MS_PER_DAY) {
    await db.update(accessTokens).set({ expiresAt: fullExpiry }).where(eq(accessTokens.id, session.id))
    setSessionCookie(event, raw)
  }
  return session.customerId
}
