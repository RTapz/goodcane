// Transaction-pooler settings (prepare: false, one connection per client) with two separate clients,
// standing in for two serverless instances. Row locks and transaction-scoped advisory locks live
// inside one transaction, and a transaction pooler keeps a transaction on one server connection,
// so the guarantees must hold exactly as they do with a normal pool.
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql as rawSql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import type { Db } from '../../server/db/client'
import { ownerLoginAttempts, turnedAway } from '../../server/db/schema'
import { payStart } from '../../server/services/orders/pay-start'
import { ownerLogin } from '../../server/services/owner/sessions'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, requestedOrder } from './fixtures'

const url = testDatabaseUrl()
const pooled = () => postgres(url, { prepare: false, max: 1, onnotice: () => {} })
const clientA = pooled()
const clientB = pooled()
const dbA = drizzle(clientA, { schema }) as unknown as Db
const dbB = drizzle(clientB, { schema }) as unknown as Db

afterAll(async () => {
  await resetTestDatabase(clientA)
  await Promise.all([clientA.end(), clientB.end()])
})

const now = new Date('2026-10-17T12:00:00Z')

beforeEach(async () => {
  await resetTestDatabase(clientA)
})

describe('two pooled instances at once', () => {
  it('race for the last spaces: SELECT ... FOR UPDATE lets exactly one hold win', async () => {
    const dropId = await makeDrop(dbA, 5, new Date(now.getTime() + 48 * HOUR))
    const itemId = await makeItem(dbA)
    const a = await requestedOrder(dbA, dropId, itemId, 3, now)
    const b = await requestedOrder(dbB, dropId, itemId, 3, now)

    const results = await Promise.all([
      payStart(dbA, a.orderId, { now, customerId: a.customerId, demoMode: true }),
      payStart(dbB, b.orderId, { now, customerId: b.customerId, demoMode: true })
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(['held', 'rejected'])
    const [count] = await dbA.select({ n: rawSql<number>`count(*)::int` }).from(turnedAway)
    expect(count?.n).toBe(1)
  })

  it('parallel wrong passcodes from one IP on both instances stop at the limit of 5', async () => {
    const guess = (db: Db) => ownerLogin(db, { passcode: 'wrong', expected: 'not-this', ip: '203.0.113.9', now })
    await Promise.all(Array.from({ length: 8 }, (_, i) => guess(i % 2 === 0 ? dbA : dbB)))
    const [count] = await dbA.select({ n: rawSql<number>`count(*)::int` }).from(ownerLoginAttempts)
    expect(count?.n).toBe(5)
  })
})
