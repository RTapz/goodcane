// pay-start and the simulated payment against the real *_test database.
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { orderHistory, orders, payments, turnedAway } from '../../server/db/schema'
import { payStart } from '../../server/services/orders/pay-start'
import { simulatePayment } from '../../server/services/payments/simulate'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, MIN, requestedOrder } from './fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-17T12:00:00Z')
let dropId: string
let itemId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  dropId = await makeDrop(db, 5, new Date(now.getTime() + 48 * HOUR))
  itemId = await makeItem(db)
})

const ref = () => `TEST-${randomUUID()}`
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const pay = (orderId: string, customerId: string, outcome: 'success' | 'failed' | 'no_response', when = now, reference = ref()) =>
  simulatePayment(db, { orderId, reference, outcome }, { now: when, customerId, demoMode: true })
const start = (orderId: string, customerId: string, when = now) => payStart(db, orderId, { now: when, customerId, demoMode: true })
const rows = async (table: typeof payments | typeof turnedAway | typeof orderHistory) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n

describe('pay-start (BR-O1, BR-C4)', () => {
  it('holds for 10 minutes, and returns an existing active hold unchanged', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const first = await start(a.orderId, a.customerId)
    expect(first).toEqual({ kind: 'held', holdExpiresAt: at(10 * MIN), existing: false })
    const again = await start(a.orderId, a.customerId, at(2 * MIN))
    expect(again).toEqual({ kind: 'held', holdExpiresAt: at(10 * MIN), existing: true })
    expect(await rows(orderHistory)).toBe(1) // creation only: a hold is not a state change (BR-O5)
  })

  it('two simultaneous pay-starts for the last spaces: exactly one succeeds', async () => {
    // Capacity 5. Both orders want 3, so only one can be held.
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const b = await requestedOrder(db, dropId, itemId, 3, now)
    const results = await Promise.all([start(a.orderId, a.customerId), start(b.orderId, b.customerId)])
    const kinds = results.map((r) => r.kind).sort()
    expect(kinds).toEqual(['held', 'rejected'])
    const rejected = results.find((r) => r.kind === 'rejected')
    expect(rejected).toEqual({ kind: 'rejected', reason: 'not_enough_space', spacesLeft: 2 })
    expect(await rows(turnedAway)).toBe(1)
  })

  it('records turned_away once per order however often it is retried (BR-F2)', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const b = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    await start(b.orderId, b.customerId)
    await start(b.orderId, b.customerId, at(MIN))
    const [row] = await db.select().from(turnedAway)
    expect(await rows(turnedAway)).toBe(1)
    expect(row).toMatchObject({ orderId: b.orderId, units: 3, reason: 'not_enough_space' })
  })

  it('an expired hold frees its capacity', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const b = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    expect((await start(b.orderId, b.customerId, at(9 * MIN))).kind).toBe('rejected')
    // 11 minutes later A's hold has expired, so B fits.
    expect(await start(b.orderId, b.customerId, at(11 * MIN))).toMatchObject({ kind: 'held' })
  })

  it('refuses after the cut-off by server time', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    expect(await start(a.orderId, a.customerId, at(49 * HOUR))).toEqual({ kind: 'rejected', reason: 'drop_closed' })
  })

  it('another customer cannot pay-start someone else’s order', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const b = await requestedOrder(db, dropId, itemId, 1, now)
    expect(await start(a.orderId, b.customerId)).toEqual({ kind: 'not_found' })
  })
})

describe('simulated payment (BR-P3, BR-P4, BR-O2)', () => {
  it('success confirms: paid, hold cleared, one history row, link issued once', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    const result = await pay(a.orderId, a.customerId, 'success', at(MIN))
    expect(result).toMatchObject({ kind: 'processed', result: 'confirmed', refundDue: false })
    if (result.kind === 'processed') expect(result.privateLinkToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [order] = await db.select().from(orders).where(eq(orders.id, a.orderId))
    expect(order).toMatchObject({ status: 'paid_confirmed', paidAt: at(MIN), holdExpiresAt: null })
    const history = await db.select().from(orderHistory).where(eq(orderHistory.orderId, a.orderId))
    expect(history.map((h) => `${h.fromStatus}>${h.toStatus}`)).toEqual(['null>requested', 'requested>paid_confirmed'])
  })

  it('the same reference twice gives one confirmation and returns the stored result', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    const reference = ref()
    const first = await pay(a.orderId, a.customerId, 'success', at(MIN), reference)
    const second = await pay(a.orderId, a.customerId, 'success', at(2 * MIN), reference)
    expect(first).toMatchObject({ kind: 'processed', result: 'confirmed' })
    expect(second).toEqual({ kind: 'replayed', result: 'confirmed', reason: null, refundDue: false, privateLinkToken: null })
    expect(await rows(payments)).toBe(1)
    expect((await db.select().from(orderHistory).where(eq(orderHistory.toStatus, 'paid_confirmed'))).length).toBe(1)
  })

  it('the same reference racing in parallel still confirms once', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    const reference = ref()
    const results = await Promise.all([
      pay(a.orderId, a.customerId, 'success', at(MIN), reference),
      pay(a.orderId, a.customerId, 'success', at(MIN), reference)
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(['processed', 'replayed'])
    expect(await rows(payments)).toBe(1)
  })

  it('a second success with a new reference never confirms twice, and is marked refund due', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    await pay(a.orderId, a.customerId, 'success', at(MIN))
    const again = await pay(a.orderId, a.customerId, 'success', at(2 * MIN))
    expect(again).toMatchObject({ result: 'not_confirmed', reason: 'already_paid', refundDue: true })
    expect((await db.select().from(orderHistory).where(eq(orderHistory.toStatus, 'paid_confirmed'))).length).toBe(1)
  })

  it.each(['failed', 'no_response'] as const)('%s keeps the hold and the requested status, and a retry confirms', async (outcome) => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    expect(await pay(a.orderId, a.customerId, outcome, at(MIN))).toMatchObject({ result: 'hold_kept', refundDue: false })
    const [order] = await db.select().from(orders).where(eq(orders.id, a.orderId))
    expect(order).toMatchObject({ status: 'requested', holdExpiresAt: at(10 * MIN) })
    expect(await pay(a.orderId, a.customerId, 'success', at(2 * MIN))).toMatchObject({ result: 'confirmed' })
  })

  it('success after the hold expired confirms if the order still fits (BR-O2)', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    expect(await pay(a.orderId, a.customerId, 'success', at(11 * MIN))).toMatchObject({ result: 'confirmed' })
  })

  it('success after the hold expired, with no room left: not confirmed, refund due, state unchanged', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const b = await requestedOrder(db, dropId, itemId, 3, now)
    await start(a.orderId, a.customerId)
    // A's hold expires; B takes the spaces and pays.
    await start(b.orderId, b.customerId, at(11 * MIN))
    await pay(b.orderId, b.customerId, 'success', at(12 * MIN))
    const late = await pay(a.orderId, a.customerId, 'success', at(13 * MIN))
    const retry = await pay(a.orderId, a.customerId, 'success', at(14 * MIN))
    expect(late).toMatchObject({ result: 'not_confirmed', reason: 'not_enough_space', refundDue: true })
    expect(retry).toMatchObject({ result: 'not_confirmed', reason: 'not_enough_space', refundDue: true })
    const [order] = await db.select().from(orders).where(eq(orders.id, a.orderId))
    expect(order).toMatchObject({ status: 'requested', paidAt: null })
    const turned = await db.select().from(turnedAway).where(eq(turnedAway.orderId, a.orderId))
    expect(turned).toHaveLength(1)
    const stored = await db.select().from(payments).where(eq(payments.orderId, a.orderId))
    expect(stored.every((p) => p.result === 'not_confirmed' && p.refundDue)).toBe(true)
  })

  it('success after the cut-off without an active hold is drop_closed; with an active hold it is honoured', async () => {
    const closing = await makeDrop(db, 5, at(5 * MIN))
    const a = await requestedOrder(db, closing, itemId, 1, now)
    const b = await requestedOrder(db, closing, itemId, 1, now)
    await start(a.orderId, a.customerId) // hold until +10 min, taken before the cut-off at +5
    expect(await pay(a.orderId, a.customerId, 'success', at(7 * MIN))).toMatchObject({ result: 'confirmed' })
    expect(await pay(b.orderId, b.customerId, 'success', at(7 * MIN))).toMatchObject({
      result: 'not_confirmed',
      reason: 'drop_closed',
      refundDue: true
    })
  })

  it('another customer cannot pay for someone else’s order, or reuse their reference', async () => {
    const a = await requestedOrder(db, dropId, itemId, 3, now)
    const b = await requestedOrder(db, dropId, itemId, 1, now)
    await start(a.orderId, a.customerId)
    expect(await pay(a.orderId, b.customerId, 'success')).toEqual({ kind: 'not_found' })
    const reference = ref()
    await pay(a.orderId, a.customerId, 'failed', now, reference)
    expect(await pay(b.orderId, b.customerId, 'success', now, reference)).toEqual({ kind: 'reference_conflict' })
    expect(await rows(payments)).toBe(1)
  })
})
