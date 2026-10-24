// O5 reminder queue (BR-R3 to BR-R7, BR-L5). The app never sends: it builds the queue when the
// owner reads it, and Send hands the owner a prefilled message with a fresh reminder link.
// Every BR-R7 exclusion is in the SQL below, not only on the screen.
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { pickNextDrop } from '../domain/drops/current'
import { maskPhone } from '../domain/identity/phone'
import {
  frequencyAllows,
  reminderDueAt,
  reminderWindow,
  type LastSent,
  type ReminderFrequency,
  type ReminderWindow
} from '../domain/reminders/due'
import type { Db, DbOrTx } from '../db/client'
import { accessTokens, customers, drops, reminders } from '../db/schema'
import { readSettings } from './settings'
import { generateToken, hashToken } from './tokens'

export interface EligibleCustomer {
  customerId: string
  firstName: string
  phone: string
  channel: 'whatsapp'
  frequency: ReminderFrequency
}

/**
 * Customers who may be reminded for this drop (BR-R7), with their frequency applied (BR-R4).
 * Left out: latest consent not an opt-in (opted out, stopped, None, no choice yet), channel not
 * WhatsApp (including the retired SMS), inactive for longer than the retention period, deleted, already ordered for this
 * drop (a request that has not lapsed, or a paid or fulfilled order), and anyone who already has a
 * reminder row for this drop (BR-R5, one chase). `keepQueued` keeps customers whose row for this
 * drop is still only queued: the queue uses it to re-check rows it already made.
 */
export async function eligibleForReminder(
  db: DbOrTx,
  dropId: string,
  now: Date,
  options: { keepQueued?: boolean } = {}
): Promise<EligibleCustomer[]> {
  const [drop] = await db.select().from(drops).where(eq(drops.id, dropId))
  if (!drop) return []
  const settings = await readSettings(db, ['retention_months', 'request_expiry_days', 'reminder_days_before_cutoff'])
  const activeSince = new Date(now)
  activeSince.setUTCMonth(activeSince.getUTCMonth() - settings.retention_months)

  const latestConsent = sql`(select ce."action" from "consent_events" ce where ce."customer_id" = ${customers.id}
    order by ce."created_at" desc, ce."id" desc limit 1)`
  // Same rule as isRequestLapsed: a request is open until the earlier of its expiry or the cut-off.
  const orderedForDrop = sql`exists (select 1 from "orders" o where o."customer_id" = ${customers.id} and o."drop_id" = ${dropId}
    and (o."status" in ('paid_confirmed', 'fulfilled')
      or (o."status" = 'requested'
        and ${now.toISOString()}::timestamptz < least(o."created_at" + make_interval(days => ${settings.request_expiry_days}), ${drop.cutOffAt.toISOString()}::timestamptz))))`
  const remindedForDrop = options.keepQueued
    ? sql`exists (select 1 from "reminders" r where r."customer_id" = ${customers.id} and r."drop_id" = ${dropId} and r."status" = 'sent')`
    : sql`exists (select 1 from "reminders" r where r."customer_id" = ${customers.id} and r."drop_id" = ${dropId})`

  const rows = await db
    .select({
      customerId: customers.id,
      firstName: customers.firstName,
      phone: customers.phone,
      frequency: customers.reminderFrequency
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        eq(customers.reminderChannel, 'whatsapp'),
        sql`${customers.reminderFrequency} is not null`,
        sql`${customers.lastActiveAt} >= ${activeSince.toISOString()}::timestamptz`,
        sql`${latestConsent} = 'opt_in'`,
        sql`not ${orderedForDrop}`,
        sql`not ${remindedForDrop}`
      )
    )
    .orderBy(asc(customers.firstName))
  if (rows.length === 0) return []

  // Frequency: each customer's latest reminder sent for another drop, and where that drop sits.
  const allDrops = await db.select({ id: drops.id }).from(drops).orderBy(asc(drops.dropAt))
  const index = new Map(allDrops.map((d, i) => [d.id, i]))
  const sent = await db
    .select({ customerId: reminders.customerId, dropId: reminders.dropId, sentAt: reminders.sentAt })
    .from(reminders)
    .where(and(eq(reminders.status, 'sent'), ne(reminders.dropId, dropId), inArray(reminders.customerId, rows.map((r) => r.customerId))))
    .orderBy(desc(reminders.sentAt))
  const lastSent = new Map<string, LastSent>()
  for (const s of sent) {
    if (!lastSent.has(s.customerId) && s.sentAt) lastSent.set(s.customerId, { dropIndex: index.get(s.dropId) ?? -1, sentAt: s.sentAt })
  }
  const thisDrop = { index: index.get(dropId) ?? 0, dueAt: reminderDueAt(drop.cutOffAt, settings.reminder_days_before_cutoff) }

  return rows
    .filter((r) => frequencyAllows(r.frequency as ReminderFrequency, thisDrop, lastSent.get(r.customerId) ?? null))
    .map((r) => ({
      customerId: r.customerId,
      firstName: r.firstName ?? '',
      phone: r.phone ?? '',
      channel: 'whatsapp' as const,
      frequency: r.frequency as ReminderFrequency
    }))
}

export interface QueueRow {
  reminderId: string
  customerId: string
  firstName: string
  maskedPhone: string
  channel: 'whatsapp'
  frequency: ReminderFrequency
  window: ReminderWindow
}

export interface Queue {
  drop: { id: string; dropAt: string; cutOffAt: string; dueAt: string } | null
  dueNow: QueueRow[]
  comingUp: QueueRow[]
}

/** Builds the queue for the next open drop (BR-R3), then lists the queued rows still eligible. */
export async function buildQueue(db: Db, now: Date): Promise<Queue> {
  const open = await db.select({ id: drops.id, dropAt: drops.dropAt, cutOffAt: drops.cutOffAt }).from(drops).where(eq(drops.status, 'open'))
  const next = pickNextDrop(open, now).drop
  if (!next) return { drop: null, dueNow: [], comingUp: [] }

  const fresh = await eligibleForReminder(db, next.id, now)
  if (fresh.length > 0) {
    await db
      .insert(reminders)
      .values(fresh.map((c) => ({ customerId: c.customerId, dropId: next.id, channel: c.channel, status: 'queued' as const })))
      .onConflictDoNothing()
  }

  const stillEligible = new Map((await eligibleForReminder(db, next.id, now, { keepQueued: true })).map((c) => [c.customerId, c]))
  const queued = await db
    .select({ id: reminders.id, customerId: reminders.customerId })
    .from(reminders)
    .where(and(eq(reminders.dropId, next.id), eq(reminders.status, 'queued')))

  const { reminder_days_before_cutoff: daysBefore } = await readSettings(db, ['reminder_days_before_cutoff'])
  const dueAt = reminderDueAt(next.cutOffAt, daysBefore)
  const window = reminderWindow(now, dueAt, next.cutOffAt)
  const rows: QueueRow[] = queued
    .filter((q) => stillEligible.has(q.customerId))
    .map((q) => {
      const c = stillEligible.get(q.customerId)!
      return {
        reminderId: q.id,
        customerId: c.customerId,
        firstName: c.firstName,
        maskedPhone: maskPhone(c.phone),
        channel: c.channel,
        frequency: c.frequency,
        window
      }
    })
    .sort((a, b) => a.firstName.localeCompare(b.firstName))

  return {
    drop: { id: next.id, dropAt: next.dropAt.toISOString(), cutOffAt: next.cutOffAt.toISOString(), dueAt: dueAt.toISOString() },
    dueNow: window === 'due_now' ? rows : [],
    comingUp: window === 'coming_up' ? rows : []
  }
}

export type SendResult =
  | {
      kind: 'sent'
      token: string
      firstName: string
      channel: 'whatsapp'
      drop: { dropAt: Date; cutOffAt: Date }
    }
  | { kind: 'not_found' }
  | { kind: 'refused'; reason: 'already_sent' | 'not_due' | 'closed' | 'not_eligible' }

/**
 * Send (BR-R3, BR-L5): one transaction with the reminder row locked. Only a queued row can become
 * sent (BR-R5). Due now, or Coming up in demo mode only ("Send early (demo)"). The new reminder
 * token is hashed and expires at the drop's cut-off; its raw value exists only in this result.
 */
export async function sendReminder(db: Db, reminderId: string, now: Date, ctx: { demoMode: boolean }): Promise<SendResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(reminders).where(eq(reminders.id, reminderId)).for('update')
    if (!row) return { kind: 'not_found' }
    if (row.status !== 'queued') return { kind: 'refused', reason: 'already_sent' }
    const [drop] = await tx.select().from(drops).where(eq(drops.id, row.dropId))
    if (!drop) return { kind: 'not_found' }

    const { reminder_days_before_cutoff: daysBefore } = await readSettings(tx, ['reminder_days_before_cutoff'])
    const window = reminderWindow(now, reminderDueAt(drop.cutOffAt, daysBefore), drop.cutOffAt)
    if (window === 'closed') return { kind: 'refused', reason: 'closed' }
    if (window === 'coming_up' && !ctx.demoMode) return { kind: 'refused', reason: 'not_due' }

    const customer = (await eligibleForReminder(tx, drop.id, now, { keepQueued: true })).find((c) => c.customerId === row.customerId)
    if (!customer) return { kind: 'refused', reason: 'not_eligible' }

    const token = generateToken()
    await tx.insert(accessTokens).values({
      customerId: row.customerId,
      kind: 'reminder',
      tokenHash: hashToken(token),
      expiresAt: drop.cutOffAt,
      dropId: drop.id,
      isSample: ctx.demoMode
    })
    await tx
      .update(reminders)
      .set({ status: 'sent', sentAt: now, channel: customer.channel })
      .where(and(eq(reminders.id, reminderId), eq(reminders.status, 'queued')))
    return { kind: 'sent', token, firstName: customer.firstName, channel: customer.channel, drop: { dropAt: drop.dropAt, cutOffAt: drop.cutOffAt } }
  })
}
