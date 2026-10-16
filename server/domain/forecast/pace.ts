/** Units paid at one moment (one paid order). */
export interface PaidUnits {
  paidAt: Date
  units: number
}

/** A closed drop's final paid orders. Callers pass only orders that stayed paid. */
export interface ClosedDropPaid {
  cutOffAt: Date
  paid: PaidUnits[]
}

/** Days before cut-off covered by the pace table. */
export const PACE_DAYS = [5, 4, 3, 2, 1, 0] as const
export type PaceDay = (typeof PACE_DAYS)[number]

/** Cumulative share (0 to 1) of final planned units already paid, by days before cut-off. */
export type PaceTable = Record<PaceDay, number>

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Learns the pace table from closed drops (BR-FC3).
 *
 * - For one drop, the share paid by day d = units with paidAt strictly earlier than
 *   (cutOffAt minus d days), divided by that drop's total paid units.
 * - The table is the plain average of those shares across drops (each drop counts once).
 * - Day 0 is 1 unless a payment landed at or after cut-off. That should never happen
 *   (BR-D3), and if it does the table shows it instead of hiding it.
 * - A drop with no paid units is skipped: 0 out of 0 has no share.
 * - No drops, or only drops with no paid units, throws a RangeError: there is nothing to learn.
 * - Callers leave out drops that hit capacity (spec section 9).
 */
export function learnPaceTable(drops: ClosedDropPaid[]): PaceTable {
  if (drops.length === 0) {
    throw new RangeError('learnPaceTable needs at least one closed drop')
  }

  const sums: PaceTable = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 }
  let used = 0

  for (const drop of drops) {
    const total = drop.paid.reduce((sum, p) => sum + p.units, 0)
    if (total === 0) {
      continue
    }
    used += 1
    for (const day of PACE_DAYS) {
      const deadline = drop.cutOffAt.getTime() - day * MS_PER_DAY
      const paidBy = drop.paid
        .filter((p) => p.paidAt.getTime() < deadline)
        .reduce((sum, p) => sum + p.units, 0)
      sums[day] += paidBy / total
    }
  }

  if (used === 0) {
    throw new RangeError('learnPaceTable: every drop has 0 paid units')
  }

  const table: PaceTable = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 }
  for (const day of PACE_DAYS) {
    table[day] = sums[day] / used
  }
  return table
}
