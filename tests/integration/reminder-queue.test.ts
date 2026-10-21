// O5 reminder queue against the real *_test database: every BR-R7 exclusion, frequencies,
// the one-chase rule (BR-R5) and the reminder link expiring at cut-off (BR-L5).
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { consentEvents, customers, drops, reminders, settings } from '../../server/db/schema'
import { settingsDefaults } from '../../server/db/settings-defaults'
import { redeemLink } from '../../server/services/links'
import { buildQueue, eligibleForReminder, sendReminder } from '../../server/services/reminders-queue'
import { applyPurge } from '../../server/services/retention'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { DAY, insertOrder, makeDropAt, makeFlavour } from './owner-fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-21T12:00:00Z')
const at = (days: number) => new Date(now.getTime() + days * DAY)
let previousDrop: string
let nextDrop: string
let itemId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  await db.insert(settings).values(Object.entries(settingsDefaults).map(([key, value]) => ({ key, value })))
  itemId = await makeFlavour(db, 'Raw cane')
  previousDrop = await makeDropAt(db, at(-3), { status: 'completed' })
  // Cut-off in 1 day: with reminders due 2 days before, it is due now.
  nextDrop = await makeDropAt(db, at(1))
})

type Frequency = 'every_drop' | 'every_second_drop' | 'monthly'

/** A customer who opted in on C6 a week ago, active today. */
async function optedIn(name: string, frequency: Frequency = 'every_drop', channel: 'whatsapp' | 'sms' = 'whatsapp') {
  const [c] = await db
    .insert(customers)
    .values({ firstName: name, phone: '+233200000123', reminderChannel: channel, reminderFrequency: frequency, lastActiveAt: now })
    .returning({ id: customers.id })
  await db.insert(consentEvents).values({ customerId: c!.id, action: 'opt_in', channel, frequency, source: 'c6', createdAt: at(-7) })
  return c!.id
}

const eligibleIds = async (dropId = nextDrop, when = now) => (await eligibleForReminder(db, dropId, when)).map((e) => e.customerId)

describe('BR-R7: who may be reminded for a drop', () => {
  it('an opted-in, active customer with no order and no reminder is eligible', async () => {
    const ama = await optedIn('Ama')
    expect(await eligibleIds()).toEqual([ama])
  })

  it('leaves out stopped, None and no choice yet', async () => {
    const stopped = await optedIn('Stopped')
    await db.insert(consentEvents).values({ customerId: stopped, action: 'opt_out', channel: null, source: 'c6', createdAt: at(-1) })
    const none = await optedIn('None')
    await db.update(customers).set({ reminderChannel: 'none', reminderFrequency: null }).where(eq(customers.id, none))
    await db.insert(consentEvents).values({ customerId: none, action: 'opt_out', channel: 'none', source: 'c6', createdAt: at(-1) })
    await db.insert(customers).values({ firstName: 'Never chose', phone: '+233200000124', lastActiveAt: now })
    expect(await eligibleIds()).toEqual([])
  })

  it('leaves out a customer inactive for longer than the retention period, and a deleted one', async () => {
    const inactive = await optedIn('Inactive')
    await db.update(customers).set({ lastActiveAt: at(-7 * 31) }).where(eq(customers.id, inactive))
    const deleted = await optedIn('Deleted')
    await db.transaction((tx) => applyPurge(tx, deleted, now))
    expect(await eligibleIds()).toEqual([])
  })

  it('leaves out a customer who already ordered for the drop, but not one whose request lapsed or was cancelled', async () => {
    const paid = await optedIn('Paid')
    await insertOrder(db, { dropId: nextDrop, itemId, quantity: 1, status: 'paid_confirmed', createdAt: at(-1), paidAt: at(-1), customerId: paid })
    const requested = await optedIn('Requested')
    await insertOrder(db, { dropId: nextDrop, itemId, quantity: 1, status: 'requested', createdAt: at(-0.5), customerId: requested })
    const lapsed = await optedIn('Lapsed')
    await insertOrder(db, { dropId: nextDrop, itemId, quantity: 1, status: 'requested', createdAt: at(-3), customerId: lapsed })
    const cancelled = await optedIn('Cancelled')
    await insertOrder(db, { dropId: nextDrop, itemId, quantity: 1, status: 'cancelled', createdAt: at(-1), customerId: cancelled })
    expect((await eligibleIds()).sort()).toEqual([lapsed, cancelled].sort())
  })

  it('leaves out a customer who already has a reminder for the drop, queued or sent (BR-R5)', async () => {
    const queued = await optedIn('Queued')
    await db.insert(reminders).values({ customerId: queued, dropId: nextDrop, channel: 'whatsapp', status: 'queued' })
    const sent = await optedIn('Sent')
    await db.insert(reminders).values({ customerId: sent, dropId: nextDrop, channel: 'whatsapp', status: 'sent', sentAt: at(-0.5) })
    expect(await eligibleIds()).toEqual([])
  })

  it('applies the frequency: every second drop skips the drop after a reminded one', async () => {
    const second = await optedIn('Second', 'every_second_drop')
    const every = await optedIn('Every', 'every_drop')
    for (const id of [second, every]) {
      await db.insert(reminders).values({ customerId: id, dropId: previousDrop, channel: 'whatsapp', status: 'sent', sentAt: at(-5) })
    }
    expect(await eligibleIds()).toEqual([every])
  })

  it('applies the frequency: monthly waits 28 days after the last reminder', async () => {
    const monthly = await optedIn('Monthly', 'monthly')
    await db.insert(reminders).values({ customerId: monthly, dropId: previousDrop, channel: 'whatsapp', status: 'sent', sentAt: at(-5) })
    expect(await eligibleIds()).toEqual([])
  })
})

describe('the queue and Send (BR-R3, BR-R5, BR-L5)', () => {
  it('building the queue twice makes one row per customer, and shows only masked phones', async () => {
    const ama = await optedIn('Ama')
    await buildQueue(db, now)
    const queue = await buildQueue(db, now)
    expect(queue.dueNow).toEqual([
      expect.objectContaining({ customerId: ama, firstName: 'Ama', maskedPhone: expect.stringMatching(/123$/), channel: 'whatsapp', window: 'due_now' })
    ])
    expect(JSON.stringify(queue)).not.toContain('+233200000123')
    expect(await db.select().from(reminders)).toHaveLength(1)
  })

  it('Send creates a reminder link that expires at cut-off, and marks the row sent once only', async () => {
    await optedIn('Ama')
    const [row] = (await buildQueue(db, now)).dueNow
    const sent = await sendReminder(db, row!.reminderId, now, { demoMode: false })
    expect(sent).toMatchObject({ kind: 'sent', firstName: 'Ama', channel: 'whatsapp' })
    if (sent.kind !== 'sent') return
    expect(await sendReminder(db, row!.reminderId, now, { demoMode: false })).toEqual({ kind: 'refused', reason: 'already_sent' })
    const [stored] = await db.select().from(reminders)
    expect(stored).toMatchObject({ status: 'sent', sentAt: now })

    expect(await redeemLink(db, sent.token, at(0.5), true, 'reminder')).not.toBeNull()
    expect(await redeemLink(db, sent.token, at(1), true, 'reminder')).toBeNull() // at cut-off
    expect(await redeemLink(db, sent.token, now, true)).toBeNull() // not a private link
  })

  it('a customer who orders after being queued drops off the queue and cannot be sent to', async () => {
    const ama = await optedIn('Ama')
    const [row] = (await buildQueue(db, now)).dueNow
    await insertOrder(db, { dropId: nextDrop, itemId, quantity: 1, status: 'paid_confirmed', createdAt: now, paidAt: now, customerId: ama })
    expect((await buildQueue(db, now)).dueNow).toEqual([])
    expect(await sendReminder(db, row!.reminderId, now, { demoMode: false })).toEqual({ kind: 'refused', reason: 'not_eligible' })
  })

  it('Coming up rows can only be sent early in demo mode', async () => {
    // Make a drop with its cut-off 3 days out the next one: due tomorrow, so coming up today.
    await resetNextDrop(await makeDropAt(db, at(3)))
    await optedIn('Ama')
    const queue = await buildQueue(db, now)
    expect(queue.dueNow).toEqual([])
    const [row] = queue.comingUp
    expect(row).toMatchObject({ window: 'coming_up' })
    expect(await sendReminder(db, row!.reminderId, now, { demoMode: false })).toEqual({ kind: 'refused', reason: 'not_due' })
    expect((await sendReminder(db, row!.reminderId, now, { demoMode: true })).kind).toBe('sent')
  })
})

/** Leaves `dropId` as the only open drop ahead, so it becomes the next drop. */
async function resetNextDrop(dropId: string) {
  await db.update(drops).set({ status: 'completed' }).where(eq(drops.id, nextDrop))
  nextDrop = dropId
}
