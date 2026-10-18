// BR-FC8: extra units to make for people who did not pre-order (walk-ins, WhatsApp, calls).
//
// We look at how many unplanned units sold in the last few finished drops and let the owner
// choose how cautious to be:
//   careful         = the lowest recent number (least waste, may run out)
//   balanced        = the average, rounded (the default)
//   never_sell_out  = the highest recent number (least chance of running out, more waste)
// With fewer than 3 finished drops the history is too thin, so we use a sample default and
// say "Low confidence".

export type BufferSetting = 'careful' | 'balanced' | 'never_sell_out'

export const BUFFER_DROPS = 5
export const MIN_DROPS_FOR_BUFFER = 3
export const SAMPLE_DEFAULT_BUFFER = 10

export interface Buffer {
  units: number
  lowConfidence: boolean
}

/** `unplannedOldestFirst`: unplanned units sold in finished drops, oldest first. */
export function unplannedBuffer(unplannedOldestFirst: number[], setting: BufferSetting): Buffer {
  const recent = unplannedOldestFirst.slice(-BUFFER_DROPS)
  if (recent.length < MIN_DROPS_FOR_BUFFER) {
    return { units: SAMPLE_DEFAULT_BUFFER, lowConfidence: true }
  }
  if (setting === 'careful') {
    return { units: Math.min(...recent), lowConfidence: false }
  }
  if (setting === 'never_sell_out') {
    return { units: Math.max(...recent), lowConfidence: false }
  }
  const average = recent.reduce((sum, units) => sum + units, 0) / recent.length
  return { units: Math.round(average), lowConfidence: false }
}
