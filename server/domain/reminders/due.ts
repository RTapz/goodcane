// When a reminder is due (BR-R4), and whether the customer's chosen frequency allows one for
// this drop. Pure: the queue service passes in the times and the last reminder sent.

const DAY = 24 * 60 * 60 * 1000
/** "Monthly" means no reminder in the 28 days before this one is due. */
export const MONTHLY_GAP_DAYS = 28

export type ReminderFrequency = 'every_drop' | 'every_second_drop' | 'monthly'
export type ReminderWindow = 'coming_up' | 'due_now' | 'closed'

export function reminderDueAt(cutOffAt: Date, daysBefore: number): Date {
  return new Date(cutOffAt.getTime() - daysBefore * DAY)
}

/** Coming up before the due time, due now until the cut-off, then closed (orders are closed too). */
export function reminderWindow(now: Date, dueAt: Date, cutOffAt: Date): ReminderWindow {
  if (now.getTime() >= cutOffAt.getTime()) return 'closed'
  return now.getTime() >= dueAt.getTime() ? 'due_now' : 'coming_up'
}

export interface LastSent {
  /** Position of the reminded drop when all drops are ordered by drop date. */
  dropIndex: number
  sentAt: Date
}

export function frequencyAllows(frequency: ReminderFrequency, drop: { index: number; dueAt: Date }, last: LastSent | null): boolean {
  if (frequency === 'every_drop' || !last) return true
  if (frequency === 'every_second_drop') return drop.index - last.dropIndex >= 2
  return drop.dueAt.getTime() - last.sentAt.getTime() >= MONTHLY_GAP_DAYS * DAY
}
