// BR-FC7: an honest "about 45 to 55" instead of a single precise-looking number.
//
// The range is the projection plus or minus how wrong recent forecasts were (the recent error
// band, as a fraction, e.g. 0.09 for 9%). With no scored forecasts yet we use 10%.

export const FALLBACK_ERROR_BAND = 0.1

export interface ProjectionRange {
  low: number
  high: number
  /** True when the 10% fallback was used. */
  fallback: boolean
}

export function projectionRange(projectedUnits: number, errorBand: number | null): ProjectionRange {
  const band = errorBand ?? FALLBACK_ERROR_BAND
  return {
    low: Math.max(0, Math.round(projectedUnits * (1 - band))),
    high: Math.round(projectedUnits * (1 + band)),
    fallback: errorBand === null
  }
}
