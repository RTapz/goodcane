// BR-FC4 and BR-FC5: how many planned (pre-ordered) units we expect this drop to end with.

import { available, unavailable, type Maybe } from './result'

/**
 * Pace projection: if 60% of a drop's orders usually arrive by now and 30 units are paid,
 * the drop will probably end near 30 / 0.6 = 50 units. Earlier in the week the share is
 * smaller, so the same 30 units project higher: 30 / 0.4 = 75.
 * A share of 0 would mean dividing by zero, so that is reported, not computed.
 */
export function paceProjection(paidUnitsNow: number, share: number): Maybe<number, 'share_zero'> {
  if (share <= 0) {
    return unavailable('share_zero')
  }
  return available(paidUnitsNow / share)
}

export const MIN_DROPS_FOR_PACE = 4

export type HeadlineMethod = 'pace' | 'baseline' | 'baseline_too_early' | 'none'

export interface Headline {
  method: HeadlineMethod
  /** Null only when neither number exists (no history and no pace). */
  projectedUnits: number | null
}

/**
 * BR-FC5: which projection to lead with.
 * Pace needs at least 4 finished drops to learn from and must be within 5 days of cut-off.
 * Otherwise we fall back to the baseline, saying why.
 */
export function chooseHeadline(args: {
  closedDrops: number
  baseline: Maybe<number, string>
  pace: Maybe<number, string>
  tooEarlyForPace: boolean
}): Headline {
  const { closedDrops, baseline, pace, tooEarlyForPace } = args
  if (closedDrops >= MIN_DROPS_FOR_PACE && !tooEarlyForPace && pace.ok) {
    return { method: 'pace', projectedUnits: pace.value }
  }
  if (baseline.ok) {
    return { method: tooEarlyForPace ? 'baseline_too_early' : 'baseline', projectedUnits: baseline.value }
  }
  return { method: 'none', projectedUnits: null }
}
