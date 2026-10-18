// Every forecast function, with the spec fixtures (5.9) and each edge case.
import { describe, expect, it } from 'vitest'
import {
  bias,
  chooseHeadline,
  conversionRate,
  demandUnits,
  likelyUnits,
  mape,
  naiveBenchmark,
  paceProjection,
  paceShareAt,
  plannedShare,
  projectionRange,
  suggestedProduction,
  turnedAwayUnits,
  unplannedBuffer,
  wape,
  weightedBaseline,
  type PaceTable
} from '../../../server/domain/forecast'

const seedShape: PaceTable = { 5: 0.2, 4: 0.35, 3: 0.6, 2: 0.8, 1: 0.92, 0: 1 }

describe('demandUnits (BR-FC1)', () => {
  it('adds paid and turned-away units', () => {
    expect(demandUnits(50, 6)).toBe(56)
  })
  it('rejects negative units', () => {
    expect(() => demandUnits(-1, 0)).toThrow(RangeError)
  })
})

describe('weightedBaseline (BR-FC2)', () => {
  it('spec fixture: 40, 44, 50, 52 gives 48.6', () => {
    expect(weightedBaseline([40, 44, 50, 52])).toEqual({ ok: true, value: 48.6 })
  })
  it('uses only the last 4 drops', () => {
    expect(weightedBaseline([999, 40, 44, 50, 52])).toEqual({ ok: true, value: 48.6 })
  })
  it('still works with fewer than 4 drops (weights 1..n)', () => {
    // (40 x 1 + 50 x 2) / 3 = 46.67
    const result = weightedBaseline([40, 50])
    expect(result.ok && result.value).toBeCloseTo(46.667, 3)
  })
  it('no history gives a named empty result, never NaN', () => {
    expect(weightedBaseline([])).toEqual({ ok: false, reason: 'no_history' })
  })
})

describe('paceShareAt (BR-FC4)', () => {
  it('reads whole days straight from the table', () => {
    expect(paceShareAt(seedShape, 3)).toEqual({ ok: true, value: 0.6 })
  })
  it('interpolates part days: 2.3 days gives 74%', () => {
    const share = paceShareAt(seedShape, 2.3)
    expect(share.ok && share.value).toBeCloseTo(0.74, 10)
  })
  it('more than 5 days before cut-off is too early for pace', () => {
    expect(paceShareAt(seedShape, 5.5)).toEqual({ ok: false, reason: 'too_early' })
  })
  it('at or after cut-off the share is 1', () => {
    expect(paceShareAt(seedShape, 0)).toEqual({ ok: true, value: 1 })
    expect(paceShareAt(seedShape, -2)).toEqual({ ok: true, value: 1 })
  })
})

describe('paceProjection (BR-FC4)', () => {
  it('spec fixture: 30 paid at 60% gives 50', () => {
    const result = paceProjection(30, 0.6)
    expect(result.ok && result.value).toBeCloseTo(50, 10)
  })
  it('spec fixture: 30 paid at 40% gives 75', () => {
    const result = paceProjection(30, 0.4)
    expect(result.ok && result.value).toBeCloseTo(75, 10)
  })
  it('a share of zero is reported, never divided by', () => {
    expect(paceProjection(30, 0)).toEqual({ ok: false, reason: 'share_zero' })
  })
})

describe('chooseHeadline (BR-FC5)', () => {
  const baseline = { ok: true as const, value: 48 }
  const pace = { ok: true as const, value: 52 }
  it('uses pace with 4 or more finished drops', () => {
    expect(chooseHeadline({ closedDrops: 4, baseline, pace, tooEarlyForPace: false })).toEqual({ method: 'pace', projectedUnits: 52 })
  })
  it('uses the baseline with fewer than 4 finished drops', () => {
    expect(chooseHeadline({ closedDrops: 3, baseline, pace, tooEarlyForPace: false })).toEqual({ method: 'baseline', projectedUnits: 48 })
  })
  it('labels the baseline when it is too early for pace', () => {
    expect(chooseHeadline({ closedDrops: 8, baseline, pace: { ok: false, reason: 'too_early' }, tooEarlyForPace: true })).toEqual({
      method: 'baseline_too_early',
      projectedUnits: 48
    })
  })
  it('has nothing to show with no history and no pace', () => {
    expect(chooseHeadline({ closedDrops: 0, baseline: { ok: false, reason: 'no_history' }, pace: { ok: false, reason: 'x' }, tooEarlyForPace: false })).toEqual({
      method: 'none',
      projectedUnits: null
    })
  })
})

describe('likely tier (BR-FC6)', () => {
  it('uses the conversion rate from finished drops', () => {
    expect(conversionRate({ ordersPlaced: 100, ordersPaid: 80 }, 3)).toEqual({ rate: 0.8, fallback: false })
    expect(likelyUnits(10, 0.8)).toBe(8)
  })
  it('falls back to 0.7 with fewer than 3 finished drops, or no orders', () => {
    expect(conversionRate({ ordersPlaced: 100, ordersPaid: 80 }, 2)).toEqual({ rate: 0.7, fallback: true })
    expect(conversionRate({ ordersPlaced: 0, ordersPaid: 0 }, 5)).toEqual({ rate: 0.7, fallback: true })
  })
})

describe('projectionRange (BR-FC7)', () => {
  it('projection plus or minus the recent error band', () => {
    expect(projectionRange(50, 0.1)).toEqual({ low: 45, high: 55, fallback: false })
  })
  it('falls back to plus or minus 10%', () => {
    expect(projectionRange(50, null)).toEqual({ low: 45, high: 55, fallback: true })
  })
})

describe('unplannedBuffer (BR-FC8)', () => {
  const recent = [8, 12, 10, 16, 9]
  it('careful = lowest, balanced = average rounded, never sell out = highest', () => {
    expect(unplannedBuffer(recent, 'careful')).toEqual({ units: 8, lowConfidence: false })
    expect(unplannedBuffer(recent, 'balanced')).toEqual({ units: 11, lowConfidence: false })
    expect(unplannedBuffer(recent, 'never_sell_out')).toEqual({ units: 16, lowConfidence: false })
  })
  it('uses only the last 5 drops', () => {
    expect(unplannedBuffer([100, ...recent], 'never_sell_out').units).toBe(16)
  })
  it('fewer than 3 drops gives a sample default with low confidence', () => {
    expect(unplannedBuffer([8, 12], 'balanced')).toEqual({ units: 10, lowConfidence: true })
    expect(unplannedBuffer([], 'careful')).toEqual({ units: 10, lowConfidence: true })
  })
})

describe('suggestedProduction (BR-FC9)', () => {
  it('rounds projection plus buffer once', () => {
    expect(suggestedProduction(48.6, 11)).toBe(60)
  })
})

describe('plannedShare (BR-FC12)', () => {
  it('pre-ordered over pre-ordered plus unplanned', () => {
    expect(plannedShare(45, 15)).toEqual({ ok: true, value: 0.75 })
  })
  it('nothing sold gives a named empty result', () => {
    expect(plannedShare(0, 0)).toEqual({ ok: false, reason: 'no_sales' })
  })
})

describe('accuracy (BR-FC11), spec fixture as (forecast, actual)', () => {
  const pairs = [
    { forecast: 50, actual: 46 },
    { forecast: 44, actual: 50 },
    { forecast: 58, actual: 52 },
    { forecast: 47, actual: 48 },
    { forecast: 55, actual: 50 }
  ]
  it('MAPE about 8.9%', () => {
    const result = mape(pairs)
    expect(result.ok && result.value.value).toBeCloseTo(0.0886, 4)
    expect(result.ok && result.value.scored).toBe(5)
  })
  it('WAPE about 8.9% (22 over 246)', () => {
    const result = wape(pairs)
    expect(result.ok && result.value.value).toBeCloseTo(22 / 246, 10)
  })
  it('bias about +3.2% (positive means forecasting too high)', () => {
    const result = bias(pairs)
    expect(result.ok && result.value.value).toBeCloseTo(0.0323, 4)
  })
  it('naive benchmark about 6.0% on drops 2 to 5 (same formula as MAPE)', () => {
    const result = naiveBenchmark(pairs.map((p) => p.actual))
    expect(result.ok && result.value.value).toBeCloseTo(0.0604, 4)
    expect(result.ok && result.value.scored).toBe(4)
  })
  it('skips and counts a zero actual instead of dividing by it', () => {
    const result = mape([...pairs, { forecast: 5, actual: 0 }])
    expect(result.ok && result.value).toMatchObject({ scored: 5, skipped: 1 })
  })
  it('nothing to score gives named empty results, never NaN', () => {
    expect(mape([])).toEqual({ ok: false, reason: 'no_scored_drops' })
    expect(mape([{ forecast: 3, actual: 0 }])).toEqual({ ok: false, reason: 'no_scored_drops' })
    expect(wape([{ forecast: 3, actual: 0 }])).toEqual({ ok: false, reason: 'no_actuals' })
    expect(naiveBenchmark([50])).toEqual({ ok: false, reason: 'no_scored_drops' })
  })
})

describe('turnedAwayUnits (BR-F2)', () => {
  it('ignores rows whose customer later got a paid order on the drop, keeps rows with no customer', () => {
    const rows = [
      { units: 3, customerId: 'a' },
      { units: 2, customerId: 'b' },
      { units: 4, customerId: null }
    ]
    expect(turnedAwayUnits(rows, new Set(['a']))).toBe(6)
    expect(turnedAwayUnits(rows, new Set())).toBe(9)
  })
})
