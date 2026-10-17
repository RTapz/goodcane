// Reminder consent (BR-R1, BR-R2, BR-R8). Pure: the state comes from the latest consent row.

export type ConsentState = 'none_yet' | 'declined' | 'opted_in' | 'stopped'

export interface ConsentRow {
  action: 'opt_in' | 'opt_out'
  /** opt_out with channel 'none' is the None choice; opt_out with no channel is "Stop reminders". */
  channel: 'whatsapp' | 'sms' | 'none' | null
}

export function consentState(latest: ConsentRow | null): ConsentState {
  if (!latest) return 'none_yet'
  if (latest.action === 'opt_in') return 'opted_in'
  return latest.channel === 'none' ? 'declined' : 'stopped'
}

/** Opt-in is open until "Stop reminders"; after that only C9 may resubscribe (BR-R8). */
export function canOptIn(state: ConsentState): boolean {
  return state === 'none_yet' || state === 'declined'
}

/** None is a first choice; Stop is only for someone who is opted in. */
export function canOptOut(state: ConsentState, choice: 'none' | 'stop'): boolean {
  return choice === 'none' ? state === 'none_yet' : state === 'opted_in'
}
