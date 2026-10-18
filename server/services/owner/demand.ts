// O1: the demand view for one drop (spec 5.9, 6.2). Database work here; the arithmetic is in
// server/domain/forecast. Everything is in capacity-weighted units (BR-C1).
import { eq, sql } from 'drizzle-orm'
import {
  chooseHeadline,
  conversionRate,
  learnPaceTable,
  likelyUnits,
  paceProjection,
  paceShareAt,
  plannedShare,
  projectionRange,
  suggestedProduction,
  unavailable,
  unplannedBuffer,
  wape,
  weightedBaseline,
  hitCapacity,
  type BufferSetting,
  type Maybe
} from '../../domain/forecast'
import { spacesLeft } from '../../domain/capacity/spaces'
import type { Db } from '../../db/client'
import { menuItems, orderItems, orders } from '../../db/schema'
import { dropUsage } from '../capacity'
import { readSettings } from '../settings'
import { loadDropFacts, type DropFact } from './facts'
import { ensureSnapshots, scoredPairs } from './snapshots'

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** The error band uses the most recent scored drops only (BR-FC7 "recent"). */
const ERROR_BAND_DROPS = 5

export type PlannedShareView =
  | { kind: 'exact'; preordered: number; unplanned: number; share: number }
  | { kind: 'estimate'; preordered: number; expected: number }

export interface FlavourLine {
  flavour: string
  paid: number
  likely: number
}

/**
 * Pace for the drop now: needs a pace table, which needs closed drops that did not sell out.
 * Projects from demand so far (paid plus turned away, BR-FC4), so it is scored like for like.
 */
function paceNow(history: DropFact[], demandSoFar: number, daysBeforeCutOff: number): Maybe<number, string> {
  const forPace = history.filter((f) => f.paidUnits > 0 && !hitCapacity(f.paidUnits, f.drop.capacity))
  if (forPace.length === 0) return unavailable('no_history')
  const table = learnPaceTable(forPace.map((f) => ({ cutOffAt: f.drop.cutOffAt, paid: f.finalPaid })))
  const share = paceShareAt(table, daysBeforeCutOff)
  if (!share.ok) return share
  return paceProjection(demandSoFar, share.value)
}

async function flavourLines(db: Db, fact: DropFact, rate: number): Promise<FlavourLine[]> {
  const lines = await db
    .select({
      orderId: orderItems.orderId,
      flavour: menuItems.name,
      units: sql<number>`(${orderItems.quantity} * ${menuItems.capacityWeight})::int`
    })
    .from(orderItems)
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.dropId, fact.drop.id))

  const byId = new Map(fact.orders.map((o) => [o.id, o]))
  const totals = new Map<string, { paid: number; requested: number }>()
  for (const line of lines) {
    const order = byId.get(line.orderId)
    if (!order) continue
    const paid = order.status === 'paid_confirmed' || order.status === 'fulfilled'
    // Lapsed requests are left out, like everywhere else that reads requests (5.3 note).
    const requested = order.status === 'requested' && !order.lapsed
    if (!paid && !requested) continue
    const total = totals.get(line.flavour) ?? { paid: 0, requested: 0 }
    if (paid) total.paid += line.units
    else total.requested += line.units
    totals.set(line.flavour, total)
  }
  return [...totals.entries()]
    .map(([flavour, t]) => ({ flavour, paid: t.paid, likely: Math.round(likelyUnits(t.requested, rate)) }))
    .sort((a, b) => b.paid + b.likely - (a.paid + a.likely) || a.flavour.localeCompare(b.flavour))
}

export async function dropDemand(db: Db, dropId: string, ctx: { now: Date; demoMode: boolean }) {
  const { now } = ctx
  const settings = await readSettings(db, ['buffer_setting', 'forecast_checkpoint_days', 'request_expiry_days'])
  const facts = await loadDropFacts(db, now, settings.request_expiry_days)
  const fact = facts.find((f) => f.drop.id === dropId)
  if (!fact) return null

  const snapshots = await ensureSnapshots(db, facts, { now, checkpointDays: settings.forecast_checkpoint_days, demoMode: ctx.demoMode })
  const { drop } = fact

  // History: drops already closed, before this one, oldest first.
  const history = facts.filter((f) => f.closed && f.drop.cutOffAt.getTime() < drop.cutOffAt.getTime())
  const daysBeforeCutOff = (drop.cutOffAt.getTime() - now.getTime()) / MS_PER_DAY

  const baseline = weightedBaseline(history.map((f) => f.demandUnits))
  const pace = paceNow(history, fact.demandUnits, daysBeforeCutOff)
  const headline = chooseHeadline({
    closedDrops: history.length,
    baseline,
    pace,
    tooEarlyForPace: daysBeforeCutOff > 5
  })

  const recentPairs = scoredPairs(facts, snapshots, drop.cutOffAt).slice(-ERROR_BAND_DROPS)
  const errorBand = wape(recentPairs)
  const range =
    headline.projectedUnits === null ? null : projectionRange(headline.projectedUnits, errorBand.ok ? errorBand.value.value : null)

  const conversion = conversionRate(
    {
      ordersPlaced: history.reduce((sum, f) => sum + f.ordersPlaced, 0),
      ordersPaid: history.reduce((sum, f) => sum + f.ordersPaid, 0)
    },
    history.length
  )

  const setting = settings.buffer_setting as BufferSetting
  const unplanned = history.filter((f) => f.drop.unplannedSold !== null).map((f) => f.drop.unplannedSold as number)
  const buffer = unplannedBuffer(unplanned, setting)
  const suggested = headline.projectedUnits === null ? null : suggestedProduction(headline.projectedUnits, buffer.units)

  // BR-FC12 exactly once the batch is closed; before that an estimate against the suggestion.
  let share: PlannedShareView | null = null
  if (drop.unplannedSold !== null) {
    const exact = plannedShare(fact.paidUnits, drop.unplannedSold)
    if (exact.ok) share = { kind: 'exact', preordered: fact.paidUnits, unplanned: drop.unplannedSold, share: exact.value }
  } else if (suggested !== null && suggested > 0) {
    share = { kind: 'estimate', preordered: fact.paidUnits, expected: suggested }
  }

  const usage = (await dropUsage(db, [drop.id], now)).get(drop.id) ?? { confirmedUnits: 0, heldUnits: 0 }
  const ownSnapshots = snapshots.filter((s) => s.dropId === drop.id)
  const weights = await db
    .selectDistinct({ size: menuItems.size, weight: menuItems.capacityWeight })
    .from(menuItems)
    .orderBy(menuItems.capacityWeight, menuItems.size)

  return {
    serverNow: now.toISOString(),
    drop: {
      id: drop.id,
      dropAt: drop.dropAt.toISOString(),
      cutOffAt: drop.cutOffAt.toISOString(),
      status: drop.status,
      capacity: drop.capacity,
      closed: fact.closed,
      isSample: drop.isSample
    },
    units: {
      paid: fact.paidUnits,
      openRequested: fact.openRequestedUnits,
      likely: Math.round(likelyUnits(fact.openRequestedUnits, conversion.rate)),
      conversion,
      turnedAway: fact.turnedAwayUnits,
      spacesLeft: spacesLeft({ capacity: drop.capacity, ...usage }),
      hitCapacity: hitCapacity(fact.paidUnits, drop.capacity)
    },
    forecast: {
      method: headline.method,
      projected: headline.projectedUnits === null ? null : Math.round(headline.projectedUnits),
      range,
      baseline: baseline.ok ? Math.round(baseline.value) : null,
      pace: pace.ok ? Math.round(pace.value) : null,
      paceUnavailable: pace.ok ? null : pace.reason,
      closedDrops: history.length,
      errorBandDrops: errorBand.ok ? errorBand.value.scored : 0
    },
    // Not named `buffer`: h3 sends any response with a top-level `buffer` key as raw bytes.
    unplannedBuffer: { setting, units: buffer.units, lowConfidence: buffer.lowConfidence },
    suggested,
    plannedShare: share,
    actuals: fact.closed
      ? {
          made: drop.unitsMade,
          unplanned: drop.unplannedSold,
          wasted: drop.unitsWasted,
          demand: fact.demandUnits,
          snapshotPace: ownSnapshots.find((s) => s.method === 'pace')?.projectedUnits ?? null,
          snapshotBaseline: ownSnapshots.find((s) => s.method === 'baseline')?.projectedUnits ?? null
        }
      : null,
    byFlavour: await flavourLines(db, fact, conversion.rate),
    unitWeights: weights
  }
}

export type DropDemand = NonNullable<Awaited<ReturnType<typeof dropDemand>>>
