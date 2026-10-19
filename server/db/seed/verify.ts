// Verification run at the end of `pnpm seed`, inside the same transaction.
// It prints every check, then throws if any failed, which rolls the whole seed back.
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { spacesLeft } from '../../domain/capacity'
import { hitCapacity, learnPaceTable, PACE_DAYS, type ClosedDropPaid, type PaceDay } from '../../domain/forecast'
import { dropUsage } from '../../services/capacity'
import type { Db } from '../client'
import * as schema from '../schema'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export const EXPECTED_SETTINGS = 12
/** Target cumulative pace in percent (spec section 9). */
export const TARGET_PACE: Record<PaceDay, number> = { 5: 20, 4: 35, 3: 60, 2: 80, 1: 92, 0: 100 }
export const PACE_TOLERANCE_POINTS = 8
/** The live drop after a seed: about 30 paid and about 10 requested units (spec section 9). */
export const LIVE_PAID_UNITS = { min: 28, max: 36 }
export const LIVE_REQUESTED_UNITS = { min: 9, max: 16 }

export interface LiveDropState {
  capacity: number
  /** Paid and confirmed units, as customers' spaces left counts them. */
  paidUnits: number
  /** Units in active holds. */
  heldUnits: number
  /** Units in requested orders. */
  requestedUnits: number
}

/** Problems with the live drop as customers would see it; empty when it is as the spec says. */
export function checkLiveDrop(live: LiveDropState): string[] {
  const problems: string[] = []
  const { paidUnits, requestedUnits } = live
  if (paidUnits < LIVE_PAID_UNITS.min || paidUnits > LIVE_PAID_UNITS.max) {
    problems.push(`live drop has ${paidUnits} paid units, expected ${LIVE_PAID_UNITS.min} to ${LIVE_PAID_UNITS.max}`)
  }
  if (requestedUnits < LIVE_REQUESTED_UNITS.min || requestedUnits > LIVE_REQUESTED_UNITS.max) {
    problems.push(
      `live drop has ${requestedUnits} requested units, expected ${LIVE_REQUESTED_UNITS.min} to ${LIVE_REQUESTED_UNITS.max}`
    )
  }
  const spaces = spacesLeft({ capacity: live.capacity, confirmedUnits: paidUnits, heldUnits: live.heldUnits })
  if (spaces < 1) {
    problems.push(`live drop has no spaces left (capacity ${live.capacity}, ${paidUnits} paid, ${live.heldUnits} held)`)
  }
  return problems
}

/** The first open sample drop whose cut-off is still ahead, counted like GET /api/drops/next. */
async function liveDropState(tx: Tx, now: Date): Promise<LiveDropState | null> {
  const [drop] = await tx
    .select({ id: schema.drops.id, capacity: schema.drops.capacity })
    .from(schema.drops)
    .where(
      and(
        eq(schema.drops.isSample, true),
        eq(schema.drops.status, 'open'),
        gt(schema.drops.cutOffAt, now)
      )
    )
    .orderBy(asc(schema.drops.dropAt))
    .limit(1)
  if (!drop) return null
  const usage = (await dropUsage(tx, [drop.id], now)).get(drop.id) ?? { confirmedUnits: 0, heldUnits: 0 }
  const [requested] = await tx
    .select({ units: sql<number>`coalesce(sum(${schema.orderItems.quantity} * ${schema.menuItems.capacityWeight}), 0)::int` })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.menuItems, eq(schema.menuItems.id, schema.orderItems.menuItemId))
    .where(and(eq(schema.orders.dropId, drop.id), eq(schema.orders.status, 'requested')))
  return {
    capacity: drop.capacity,
    paidUnits: usage.confirmedUnits,
    heldUnits: usage.heldUnits,
    requestedUnits: requested?.units ?? 0
  }
}

const countedTables = {
  settings: schema.settings,
  drops: schema.drops,
  menu_items: schema.menuItems,
  customers: schema.customers,
  orders: schema.orders,
  order_items: schema.orderItems,
  payments: schema.payments,
  order_history: schema.orderHistory,
  turned_away: schema.turnedAway,
  consent_events: schema.consentEvents,
  reminders: schema.reminders,
  access_tokens: schema.accessTokens,
  forecast_snapshots: schema.forecastSnapshots
}

export async function verifySeed(tx: Tx, now: Date): Promise<void> {
  const failures: string[] = []

  // Row counts
  console.log('\nRow counts')
  for (const [name, table] of Object.entries(countedTables)) {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(table)
    console.log(`  ${name.padEnd(20)} ${row?.n ?? 0}`)
    if (name === 'settings' && row?.n !== EXPECTED_SETTINGS) {
      failures.push(`settings has ${row?.n} rows, expected ${EXPECTED_SETTINGS}`)
    }
  }

  // Units per fulfilled order (capacity-weighted), per completed sample drop.
  const fulfilled = await tx
    .select({
      dropId: schema.orders.dropId,
      paidAt: schema.orders.paidAt,
      units: sql<number>`sum(${schema.orderItems.quantity} * ${schema.menuItems.capacityWeight})::int`
    })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.menuItems, eq(schema.menuItems.id, schema.orderItems.menuItemId))
    .where(eq(schema.orders.status, 'fulfilled'))
    .groupBy(schema.orders.id)

  const completed = await tx
    .select()
    .from(schema.drops)
    .where(and(eq(schema.drops.status, 'completed'), eq(schema.drops.isSample, true)))
    .orderBy(schema.drops.dropAt)

  // Close batch identity: made = orders sold + unplanned sold + wasted.
  console.log('\nClose batch identity (made = sold + unplanned + wasted)')
  const paceInput: ClosedDropPaid[] = []
  for (const drop of completed) {
    const orders = fulfilled.filter((o) => o.dropId === drop.id)
    const sold = orders.reduce((sum, o) => sum + o.units, 0)
    const expected = sold + (drop.unplannedSold ?? 0) + (drop.unitsWasted ?? 0)
    const ok = drop.unitsMade === expected
    console.log(
      `  ${drop.dropAt.toISOString().slice(0, 10)}  made ${drop.unitsMade} = ${sold} + ${drop.unplannedSold} + ${drop.unitsWasted}  ${ok ? 'ok' : 'FAIL'}`
    )
    if (!ok) {
      failures.push(`units_made identity fails for drop on ${drop.dropAt.toISOString()}`)
    }

    // Drops that hit capacity are left out of the pace table: turning customers away
    // cuts off the late orders, so their arrival shape is skewed towards early days.
    if (hitCapacity(sold, drop.capacity)) {
      console.log('    (hit capacity: left out of the pace table)')
      continue
    }
    paceInput.push({
      cutOffAt: drop.cutOffAt,
      paid: orders.map((o) => ({ paidAt: o.paidAt as Date, units: o.units }))
    })
  }

  // Learned pace table against the target.
  console.log(`\nPace table from ${paceInput.length} drops (cumulative % paid by days before cut-off)`)
  try {
    const learned = learnPaceTable(paceInput)
    console.log('  day   learned   target')
    for (const day of PACE_DAYS) {
      const learnedPoints = learned[day] * 100
      const off = Math.abs(learnedPoints - TARGET_PACE[day])
      const ok = off <= PACE_TOLERANCE_POINTS
      console.log(
        `  ${String(day).padStart(3)}   ${learnedPoints.toFixed(1).padStart(6)}%   ${String(TARGET_PACE[day]).padStart(5)}%  ${ok ? 'ok' : 'FAIL'}`
      )
      if (!ok) {
        failures.push(`pace at day ${day} is ${off.toFixed(1)} points off the target (limit ${PACE_TOLERANCE_POINTS})`)
      }
    }
  } catch (error) {
    failures.push(`could not learn the pace table: ${(error as Error).message}`)
  }

  // The live drop as customers see it: about 30 paid, about 10 requested, spaces left.
  console.log('\nLive drop')
  const live = await liveDropState(tx, now)
  if (!live) {
    console.log('  none  FAIL')
    failures.push('no open sample drop with its cut-off ahead')
  } else {
    const problems = checkLiveDrop(live)
    const spaces = spacesLeft({ capacity: live.capacity, confirmedUnits: live.paidUnits, heldUnits: live.heldUnits })
    console.log(
      `  capacity ${live.capacity}, ${live.paidUnits} paid, ${live.heldUnits} held, ${live.requestedUnits} requested, ${spaces} spaces left  ${problems.length === 0 ? 'ok' : 'FAIL'}`
    )
    failures.push(...problems)
  }

  if (failures.length > 0) {
    throw new Error(`Seed verification failed:\n  - ${failures.join('\n  - ')}`)
  }
  console.log('\nAll checks passed.')
}
