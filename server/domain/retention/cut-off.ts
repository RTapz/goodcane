// BR-DP1: a customer is inactive when their last activity is before this moment: the same date
// and time, `months` earlier (UTC), clamped to the last day of a shorter month. Pure.
export function inactiveCutOff(now: Date, months: number): Date {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() - months
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(year, month, Math.min(now.getUTCDate(), lastDay), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds())
  )
}
