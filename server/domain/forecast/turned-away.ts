// BR-F2: turned-away units for one drop, without counting anyone twice.
//
// A customer who was turned away and then got a paid order on the same drop anyway (for
// example after reducing their quantity) is already counted in the paid units. Counting
// their turned-away row as well would add the same person's demand twice, so it is ignored.
// Rows with no order (or whose customer was purged) cannot be matched, so they are kept.

export interface TurnedAwayRow {
  units: number
  /** The customer of the order that was turned away, if known. */
  customerId: string | null
}

export function turnedAwayUnits(rows: TurnedAwayRow[], customersWithPaidOrder: Set<string>): number {
  return rows
    .filter((row) => row.customerId === null || !customersWithPaidOrder.has(row.customerId))
    .reduce((sum, row) => sum + row.units, 0)
}
