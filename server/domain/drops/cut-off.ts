const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Cut-off for a drop: the drop time minus the lead time (BR-D2).
 * Works on UTC instants. Accra has no daylight saving, so whole days are always 24 hours.
 */
export function getCutOff(dropAt: Date, leadTimeDays: number): Date {
  if (Number.isNaN(dropAt.getTime())) {
    throw new RangeError('dropAt must be a valid date')
  }
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) {
    throw new RangeError('leadTimeDays must be a whole number of days, 0 or more')
  }

  return new Date(dropAt.getTime() - leadTimeDays * MS_PER_DAY)
}
