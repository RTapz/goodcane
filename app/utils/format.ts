// Display formatting only. Times are stored in UTC and always shown in Africa/Accra.
const TIME_ZONE = 'Africa/Accra'

/** 3500 pesewas -> "GH₵35.00". */
export function formatPesewas(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`
}

/** "Tuesday 20 October". */
export function formatDropDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(date))
}

/** "Saturday 17 October, 12:00". */
export function formatCutOff(date: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(date))
}

/** Whole days, hours, minutes and seconds in a duration, for the countdown. */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  }
}
