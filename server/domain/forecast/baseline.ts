// BR-FC2: the baseline, "what usually happens", from recent finished drops.
//
// We take up to the last 4 drops' demand units and average them, but give newer drops more
// weight (1, 2, 3, 4, newest highest) because recent weeks say more about next week than
// older ones. Worked example: 40, 44, 50, 52 (oldest first)
//   (40 x 1 + 44 x 2 + 50 x 3 + 52 x 4) / (1 + 2 + 3 + 4) = 486 / 10 = 48.6
//
// With only 1 to 3 drops we use the same idea with weights 1..n (BR-FC5 needs a baseline
// even then). With no drops at all there is nothing to average.
import { available, unavailable, type Maybe } from './result'

export const BASELINE_DROPS = 4

/** `demandUnitsOldestFirst`: demand units of finished drops, oldest first. */
export function weightedBaseline(demandUnitsOldestFirst: number[]): Maybe<number, 'no_history'> {
  const recent = demandUnitsOldestFirst.slice(-BASELINE_DROPS)
  if (recent.length === 0) {
    return unavailable('no_history')
  }

  let weightedSum = 0
  let weightTotal = 0
  recent.forEach((units, index) => {
    const weight = index + 1 // oldest gets 1, newest gets the highest weight
    weightedSum += units * weight
    weightTotal += weight
  })
  return available(weightedSum / weightTotal)
}
