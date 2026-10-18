// Demo owner gate (spec 8): one shared passcode, then a random session token in a cookie.
// A live service needs real owner accounts; this only keeps the owner screens out of view.
import { createHash, timingSafeEqual } from 'node:crypto'
import { and, count, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { ownerLoginAttempts, ownerSessions } from '../../db/schema'
import { generateToken, hashToken } from '../tokens'

export const OWNER_SESSION_HOURS = 12
export const MAX_FAILED_ATTEMPTS = 5
export const ATTEMPT_WINDOW_MINUTES = 15
const KEEP_ATTEMPTS_HOURS = 24
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const sha256 = (value: string) => createHash('sha256').update(value).digest()

/**
 * Compares in constant time, so the response time does not reveal how much of the passcode
 * was right. Hashing first gives both sides the same length. An empty expected passcode
 * (not configured) never matches, so a missing setting cannot open the gate.
 */
export function checkPasscode(input: string, expected: string): boolean {
  if (!expected) return false
  return timingSafeEqual(sha256(input), sha256(expected))
}

export type LoginResult = { kind: 'ok'; token: string; expiresAt: Date } | { kind: 'wrong' } | { kind: 'throttled' }

export async function ownerLogin(
  db: Db,
  args: { passcode: string; expected: string; ip: string; now: Date }
): Promise<LoginResult> {
  const { now } = args
  const ipHash = hashToken(args.ip)

  return db.transaction(async (tx) => {
    // Attempts from the same IP take turns, so parallel guesses cannot all slip under the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ipHash}))`)
    await tx.delete(ownerLoginAttempts).where(lt(ownerLoginAttempts.createdAt, new Date(now.getTime() - KEEP_ATTEMPTS_HOURS * HOUR)))

    const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * MINUTE)
    const [recent] = await tx
      .select({ n: count() })
      .from(ownerLoginAttempts)
      .where(and(eq(ownerLoginAttempts.ipHash, ipHash), gt(ownerLoginAttempts.createdAt, windowStart)))
    if ((recent?.n ?? 0) >= MAX_FAILED_ATTEMPTS) return { kind: 'throttled' }

    if (!checkPasscode(args.passcode, args.expected)) {
      await tx.insert(ownerLoginAttempts).values({ ipHash, createdAt: now })
      return { kind: 'wrong' }
    }

    const token = generateToken()
    const expiresAt = new Date(now.getTime() + OWNER_SESSION_HOURS * HOUR)
    await tx.insert(ownerSessions).values({ tokenHash: hashToken(token), expiresAt, createdAt: now })
    return { kind: 'ok', token, expiresAt }
  })
}

export async function isOwnerSessionValid(db: Db, rawToken: string, now: Date): Promise<boolean> {
  const [session] = await db
    .select({ id: ownerSessions.id })
    .from(ownerSessions)
    .where(and(eq(ownerSessions.tokenHash, hashToken(rawToken)), isNull(ownerSessions.revokedAt), gt(ownerSessions.expiresAt, now)))
  return Boolean(session)
}

export async function revokeOwnerSession(db: Db, rawToken: string, now: Date): Promise<void> {
  await db.update(ownerSessions).set({ revokedAt: now }).where(eq(ownerSessions.tokenHash, hashToken(rawToken)))
}
