// Reminder opt-in and opt-out (BR-R1, BR-R2, BR-R8). Consent rows are only ever inserted.
// The customer row is locked so two taps cannot interleave and write contradictory rows.
import { eq } from 'drizzle-orm'
import { canOptIn, canOptOut, consentState, type ConsentSource, type ConsentState } from '../domain/reminders/consent'
import type { Db, Tx } from '../db/client'
import { consentEvents, customers } from '../db/schema'
import { latestConsent } from './me'

type Channel = 'whatsapp' | 'sms'
type Frequency = 'every_drop' | 'every_second_drop' | 'monthly'
type Source = ConsentSource

export type ConsentResult = { kind: 'ok'; state: ConsentState } | { kind: 'refused'; state: ConsentState } | { kind: 'not_found' }

async function lockedState(tx: Tx, customerId: string) {
  const [customer] = await tx.select({ id: customers.id, deletedAt: customers.deletedAt }).from(customers).where(eq(customers.id, customerId)).for('update')
  if (!customer || customer.deletedAt) return null
  return consentState(await latestConsent(tx, customerId))
}

export async function optIn(
  db: Db,
  customerId: string,
  choice: { channel: Channel; frequency: Frequency; source: Source },
  ctx: { now: Date; demoMode: boolean }
): Promise<ConsentResult> {
  return db.transaction(async (tx) => {
    const state = await lockedState(tx, customerId)
    if (!state) return { kind: 'not_found' }
    if (!canOptIn(state, choice.source)) return { kind: 'refused', state }
    await tx.insert(consentEvents).values({
      customerId,
      action: 'opt_in',
      channel: choice.channel,
      frequency: choice.frequency,
      source: choice.source,
      createdAt: ctx.now,
      isSample: ctx.demoMode
    })
    await tx
      .update(customers)
      .set({ reminderChannel: choice.channel, reminderFrequency: choice.frequency, lastActiveAt: ctx.now })
      .where(eq(customers.id, customerId))
    return { kind: 'ok', state: 'opted_in' }
  })
}

export async function optOut(
  db: Db,
  customerId: string,
  choice: { choice: 'none' | 'stop'; source: Source },
  ctx: { now: Date; demoMode: boolean }
): Promise<ConsentResult> {
  return db.transaction(async (tx) => {
    const state = await lockedState(tx, customerId)
    if (!state) return { kind: 'not_found' }
    if (!canOptOut(state, choice.choice)) return { kind: 'refused', state }
    const declined = choice.choice === 'none'
    await tx.insert(consentEvents).values({
      customerId,
      action: 'opt_out',
      channel: declined ? 'none' : null,
      frequency: null,
      source: choice.source,
      createdAt: ctx.now,
      isSample: ctx.demoMode
    })
    await tx
      .update(customers)
      .set({ reminderChannel: declined ? 'none' : null, reminderFrequency: null, lastActiveAt: ctx.now })
      .where(eq(customers.id, customerId))
    return { kind: 'ok', state: declined ? 'declined' : 'stopped' }
  })
}
