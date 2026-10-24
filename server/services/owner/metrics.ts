// The four required pilot metrics (spec section 10), shown on O6.
// Built from the same drop facts as O1, so the numbers always agree with it.
import { bias, mape, wape, type ForecastPair, type Maybe, type Score } from '../../domain/forecast'
import type { Db } from '../../db/client'
import { readSettings } from '../settings'
import { loadDropFacts, type DropFact, type OrderFact } from './facts'
import { ensureSnapshots, scoredPairs } from './snapshots'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const WEEKS_SHOWN = 4

const isPaidNow = (o: OrderFact) => o.status === 'paid_confirmed' || o.status === 'fulfilled'
const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole)
/** A score as a plain number, or null when there was nothing to score. */
const scoreValue = (result: Maybe<Score, string>) => (result.ok ? result.value.value : null)

/**
 * Repeat-order rate: of customers whose first paid order was on a drop with a later drop after
 * it (so they had a chance to order again), the share with a paid order on a later drop.
 */
function repeatOrderRate(facts: DropFact[]) {
  const latestDropAt = Math.max(...facts.map((f) => f.drop.dropAt.getTime()))
  const paidDropTimes = new Map<string, number[]>()
  for (const fact of facts) {
    for (const order of fact.orders.filter(isPaidNow)) {
      if (!order.customerId) continue
      const times = paidDropTimes.get(order.customerId) ?? []
      times.push(fact.drop.dropAt.getTime())
      paidDropTimes.set(order.customerId, times)
    }
  }
  let eligible = 0
  let repeated = 0
  for (const times of paidDropTimes.values()) {
    const first = Math.min(...times)
    if (first >= latestDropAt) continue
    eligible += 1
    if (times.some((t) => t > first)) repeated += 1
  }
  return { rate: ratio(repeated, eligible), repeated, eligible }
}

/** Monday 00:00 UTC of the ISO week containing `date`. */
function weekStart(date: Date): Date {
  const day = (date.getUTCDay() + 6) % 7
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day))
}

/** Confirmed weekly orders: paid or fulfilled orders and units, by week of drop date. */
function confirmedWeekly(facts: DropFact[], now: Date) {
  const weeks = new Map<number, { orders: number; units: number }>()
  for (const fact of facts) {
    const week = weekStart(fact.drop.dropAt).getTime()
    const paid = fact.orders.filter(isPaidNow)
    const total = weeks.get(week) ?? { orders: 0, units: 0 }
    total.orders += paid.length
    total.units += paid.reduce((sum, o) => sum + o.units, 0)
    weeks.set(week, total)
  }
  const thisWeek = weekStart(now).getTime()
  return [...weeks.entries()]
    .filter(([week]) => week <= thisWeek + 7 * MS_PER_DAY)
    .sort(([a], [b]) => a - b)
    .slice(-WEEKS_SHOWN)
    .map(([week, total]) => ({ weekStart: new Date(week).toISOString(), ...total }))
}

/** Cancellation rate: customer-cancelled paid orders over paid orders. Expiries kept separate. */
function cancellations(facts: DropFact[]) {
  const all = facts.flatMap((f) => f.orders)
  const everPaid = all.filter((o) => o.paidAt !== null)
  const byCustomer = everPaid.filter((o) => o.status === 'cancelled' && o.cancelledBy === 'customer').length
  const byOwner = everPaid.filter((o) => o.status === 'cancelled' && o.cancelledBy === 'owner').length
  // A lapsed request counts as expired: it is one, the job just has not written it yet.
  const expired = all.filter((o) => o.status === 'expired' || o.lapsed).length
  return {
    rate: ratio(byCustomer, everPaid.length),
    customerCancelled: byCustomer,
    ownerCancelled: byOwner,
    paidOrders: everPaid.length,
    expiryRate: ratio(expired, all.length),
    expired,
    ordersPlaced: all.length
  }
}

/** Forecast accuracy against the naive benchmark, both on the same scored drops (BR-FC11). */
function accuracy(facts: DropFact[], pairs: ForecastPair[], scoredDropIds: string[]) {
  const closed = facts.filter((f) => f.closed)
  // Naive forecast for each scored drop: the actual demand of the closed drop just before it.
  const naivePairs: ForecastPair[] = []
  for (const dropId of scoredDropIds) {
    const index = closed.findIndex((f) => f.drop.id === dropId)
    const previous = closed[index - 1]
    const current = closed[index]
    if (previous && current) naivePairs.push({ forecast: previous.demandUnits, actual: current.demandUnits })
  }
  const scored = mape(pairs)
  return {
    mape: scoreValue(scored),
    wape: scoreValue(wape(pairs)),
    bias: scoreValue(bias(pairs)),
    naiveMape: scoreValue(mape(naivePairs)),
    scoredDrops: scored.ok ? scored.value.scored : 0,
    naiveScoredDrops: naivePairs.length
  }
}

export async function pilotMetrics(db: Db, ctx: { now: Date; demoMode: boolean }) {
  const settings = await readSettings(db, ['forecast_checkpoint_days', 'request_expiry_days'])
  const facts = await loadDropFacts(db, ctx.now, settings.request_expiry_days)
  if (facts.length === 0) return null
  const snapshots = await ensureSnapshots(db, facts, { ...ctx, checkpointDays: settings.forecast_checkpoint_days })

  const pairs = scoredPairs(facts, snapshots)
  const paceDrops = new Set(snapshots.filter((s) => s.method === 'pace').map((s) => s.dropId))
  const scoredDropIds = facts.filter((f) => f.closed && paceDrops.has(f.drop.id)).map((f) => f.drop.id)

  return {
    repeatOrders: repeatOrderRate(facts),
    confirmedWeekly: confirmedWeekly(facts, ctx.now),
    cancellations: cancellations(facts),
    accuracy: accuracy(facts, pairs, scoredDropIds)
  }
}

export type PilotMetrics = NonNullable<Awaited<ReturnType<typeof pilotMetrics>>>
