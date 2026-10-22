// BR-F2: turned-away units for one drop, without counting anyone twice.
//
// A customer who was turned away and then got a paid order on the same drop anyway (for
// example after reducing their quantity) is already counted in the paid units. Counting
// their turned-away row as well would add the same person's demand twice, so it is ignored.
// Only a payment AFTER the row hides it: someone who had already paid and was then turned
// away asking for more is extra demand, so their row counts.
// Rows with no customer (anonymous, or purged) cannot be matched, so they are kept.

export interface TurnedAwayRow {
  units: number
  /** The customer behind the row (its order's, or the session's for a drop_full row), if known. */
  customerId: string | null
  /** When the row was recorded. */
  createdAt: Date
}

export interface PaidBy {
  customerId: string | null
  paidAt: Date
}

export function turnedAwayUnits(rows: TurnedAwayRow[], paid: PaidBy[]): number {
  const servedLater = (row: TurnedAwayRow) =>
    row.customerId !== null && paid.some((p) => p.customerId === row.customerId && p.paidAt.getTime() > row.createdAt.getTime())
  return rows.filter((row) => !servedLater(row)).reduce((sum, row) => sum + row.units, 0)
}
