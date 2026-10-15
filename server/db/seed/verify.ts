// Verification run at the end of `pnpm seed`, inside the same transaction.
// It prints every check, then throws if any failed, which rolls the whole seed back.
import { and, eq, sql } from 'drizzle-orm'
import { learnPaceTable, PACE_DAYS, type ClosedDropPaid, type PaceDay } from '../../domain/forecast'
import type { Db } from '../client'
import * as schema from '../schema'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export const EXPECTED_SETTINGS = 12
/** Target cumulative pace in percent (spec section 9). */
export const TARGET_PACE: Record<PaceDay, number> = { 5: 20, 4: 35, 3: 60, 2: 80, 1: 92, 0: 100 }
export const PACE_TOLERANCE_POINTS = 8

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

export async function verifySeed(tx: Tx): Promise<void> {
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
    if (sold >= drop.capacity) {
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

  if (failures.length > 0) {
    throw new Error(`Seed verification failed:\n  - ${failures.join('\n  - ')}`)
  }
  console.log('\nAll checks passed.')
}
