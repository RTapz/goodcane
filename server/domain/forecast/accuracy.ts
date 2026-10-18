// BR-FC11: how good were past forecasts? Each pair is (forecast, actual) for one finished drop.
//
//   MAPE (mean absolute percentage error): on average, how far off were we, as a % of what
//        really happened? Every drop counts equally.
//   WAPE (weighted absolute percentage error): all the misses added up, divided by all the
//        actuals added up. Big drops count more, small drops cannot blow it up.
//   Bias: like MAPE but keeping the sign, (forecast - actual) / actual. Positive means we
//        tend to forecast too high, negative too low.
//   Naive benchmark: a lazy forecast, "next drop = last drop's actual", scored the same way
//        as MAPE. If our forecast cannot beat this, it is not earning its keep.
//
// A drop whose actual was 0 cannot be divided by, so it is skipped (and counted as skipped)
// for MAPE and bias. If nothing can be scored, we say so instead of returning NaN.
import { available, unavailable, type Maybe } from './result'

export interface ForecastPair {
  forecast: number
  actual: number
}

export interface Score {
  value: number
  /** Drops that took part in the score. */
  scored: number
  /** Drops left out because their actual was 0. */
  skipped: number
}

export type ScoreResult = Maybe<Score, 'no_scored_drops'>

function averageOfRatios(pairs: ForecastPair[], ratio: (pair: ForecastPair) => number): ScoreResult {
  const usable = pairs.filter((pair) => pair.actual !== 0)
  if (usable.length === 0) {
    return unavailable('no_scored_drops')
  }
  const total = usable.reduce((sum, pair) => sum + ratio(pair), 0)
  return available({ value: total / usable.length, scored: usable.length, skipped: pairs.length - usable.length })
}

export function mape(pairs: ForecastPair[]): ScoreResult {
  return averageOfRatios(pairs, ({ forecast, actual }) => Math.abs(forecast - actual) / actual)
}

export function bias(pairs: ForecastPair[]): ScoreResult {
  return averageOfRatios(pairs, ({ forecast, actual }) => (forecast - actual) / actual)
}

export function wape(pairs: ForecastPair[]): Maybe<Score, 'no_scored_drops' | 'no_actuals'> {
  if (pairs.length === 0) {
    return unavailable('no_scored_drops')
  }
  const totalActual = pairs.reduce((sum, pair) => sum + pair.actual, 0)
  if (totalActual === 0) {
    return unavailable('no_actuals')
  }
  const totalError = pairs.reduce((sum, pair) => sum + Math.abs(pair.forecast - pair.actual), 0)
  return available({ value: totalError / totalActual, scored: pairs.length, skipped: 0 })
}

/**
 * The naive benchmark: each drop's forecast is simply the previous drop's actual.
 * The first drop has no previous drop, so scoring starts at the second.
 * Example actuals 46, 50, 52, 48, 50 give pairs (46, 50), (50, 52), (52, 48), (48, 50):
 * errors 4/50, 2/52, 4/48, 2/50, average 6.04%.
 */
export function naiveBenchmark(actualsOldestFirst: number[]): ScoreResult {
  const pairs: ForecastPair[] = []
  for (let i = 1; i < actualsOldestFirst.length; i++) {
    pairs.push({ forecast: actualsOldestFirst[i - 1]!, actual: actualsOldestFirst[i]! })
  }
  return mape(pairs)
}
