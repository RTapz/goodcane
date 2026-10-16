/**
 * Day weights from spec section 9, earliest day first. Day d is the 24-hour bucket
 * [cut-off minus (d+1) days, cut-off minus d days), so 5 is the earliest bucket and
 * 0 is the final day before cut-off. The weights are the cumulative pace table
 * (20, 35, 60, 80, 92, 100) turned into daily shares. Whole numbers avoid float drift.
 */
const DAY_WEIGHTS = [
  { day: 5, weight: 20 },
  { day: 4, weight: 15 },
  { day: 3, weight: 25 },
  { day: 2, weight: 20 },
  { day: 1, weight: 12 },
  { day: 0, weight: 8 }
] as const

const TOTAL_WEIGHT = DAY_WEIGHTS.reduce((sum, { weight }) => sum + weight, 0)

/**
 * Picks which day before cut-off a paid order arrives on (weighted random choice).
 * Calls `rand` exactly once, so the rest of the seed stays reproducible.
 * `rand` must return a number in [0, 1), like Math.random.
 */
export function pickDay(rand: () => number): number {
  const point = rand() * TOTAL_WEIGHT
  if (point >= 0) {
    let running = 0
    for (const { day, weight } of DAY_WEIGHTS) {
      running += weight
      if (point < running) {
        return day
      }
    }
  }
  // Reached only if rand() was below 0, 1 or more, or not a number.
  throw new RangeError(`pickDay: point ${point} is not in [0, ${TOTAL_WEIGHT})`)
}
