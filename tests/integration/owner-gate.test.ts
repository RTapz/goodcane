// Owner gate sessions and the login throttle against the real *_test database (spec 8).
// The HTTP side (cookies, 401s, 429) is covered in tests/api/app.test.ts.
import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { ownerLoginAttempts, ownerSessions } from '../../server/db/schema'
import { checkPasscode, isOwnerSessionValid, ownerLogin, revokeOwnerSession } from '../../server/services/owner/sessions'
import { hashToken } from '../../server/services/tokens'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const MIN = 60 * 1000
const now = new Date('2026-10-17T12:00:00Z')
// Made up for each run; never a real passcode.
const expected = randomBytes(12).toString('base64url')
const login = (passcode: string, when = now, ip = '203.0.113.7') => ownerLogin(db, { passcode, expected, ip, now: when })

beforeEach(async () => {
  await resetTestDatabase(client)
})

describe('checkPasscode', () => {
  it('matches only the exact passcode, and never when none is configured', () => {
    expect(checkPasscode(expected, expected)).toBe(true)
    expect(checkPasscode(`${expected}x`, expected)).toBe(false)
    expect(checkPasscode('', '')).toBe(false)
  })
})

describe('owner sessions', () => {
  it('a correct login stores only the token hash; the session works until logout', async () => {
    const result = await login(expected)
    if (result.kind !== 'ok') throw new Error('expected ok')
    const [row] = await db.select().from(ownerSessions)
    expect(row?.tokenHash).toBe(hashToken(result.token))
    expect(JSON.stringify(row)).not.toContain(result.token)

    expect(await isOwnerSessionValid(db, result.token, now)).toBe(true)
    await revokeOwnerSession(db, result.token, now)
    expect(await isOwnerSessionValid(db, result.token, now)).toBe(false)
  })

  it('a session expires after 12 hours', async () => {
    const result = await login(expected)
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(await isOwnerSessionValid(db, result.token, new Date(now.getTime() + 12 * 60 * MIN))).toBe(false)
  })
})

describe('login throttle', () => {
  it('5 failed attempts in 15 minutes gives throttled, even with the right passcode, per IP', async () => {
    for (let i = 0; i < 5; i++) expect(await login('wrong', new Date(now.getTime() + i * MIN))).toEqual({ kind: 'wrong' })
    expect(await login(expected, new Date(now.getTime() + 5 * MIN))).toEqual({ kind: 'throttled' })
    // Another IP is not affected.
    expect((await login(expected, now, '198.51.100.2')).kind).toBe('ok')
    // After the window the right passcode works again.
    expect((await login(expected, new Date(now.getTime() + 20 * MIN))).kind).toBe('ok')
  })

  it('stores only an IP hash and a time, and prunes rows older than 24 hours', async () => {
    await login('wrong', new Date(now.getTime() - 25 * 60 * MIN))
    await login('wrong', now)
    const rows = await db.select().from(ownerLoginAttempts)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]!).sort()).toEqual(['createdAt', 'id', 'ipHash'])
    expect(rows[0]!.ipHash).toBe(hashToken('203.0.113.7'))
  })

  it('parallel wrong guesses cannot slip past the limit', async () => {
    await Promise.all(Array.from({ length: 8 }, () => login('wrong')))
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(ownerLoginAttempts)
    expect(row?.n).toBe(5)
  })
})
