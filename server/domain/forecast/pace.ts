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

/**
 * Learns the pace table from closed drops (BR-FC3).
 *
 * TODO (Ryan): implement.
 * - For one drop, the share paid by day d = units with paidAt before (cutOffAt minus d days),
 *   divided by that drop's total paid units. So day 0 is always 1.
 * - The table is the average of those shares across drops.
 * - Decide what to return when there are no drops, or a drop has 0 units, and add a test for it.
 * - Callers leave out drops that hit capacity (see spec section 9).
 * Tests are waiting in tests/unit/forecast/pace.test.ts (remove `.skip` there).
 */
export function learnPaceTable(drops: ClosedDropPaid[]): PaceTable {
  void drops
  throw new Error('Not implemented yet: learnPaceTable (server/domain/forecast/pace.ts)')
}
