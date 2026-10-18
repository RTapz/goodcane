// BR-FC6: the "likely" tier, requests that have not been paid yet.
//
// Not every request turns into a payment, so we do not count requests as sales. We look at
// finished drops: of all orders placed there, what share got paid? If 80% did, then 10
// requested units today are "likely" worth about 8. This is always shown next to Paid, never
// added into it, so the owner can see what is certain and what is hopeful.

export const FALLBACK_CONVERSION = 0.7
export const MIN_DROPS_FOR_CONVERSION = 3

export interface OrderCounts {
  /** All orders placed on finished drops (paid, cancelled, expired, still requested). */
  ordersPlaced: number
  /** Of those, the ones that were paid (paid_confirmed, fulfilled, or paid then cancelled). */
  ordersPaid: number
}

export interface Conversion {
  rate: number
  /** True when the sample fallback (0.7) was used because there is too little history. */
  fallback: boolean
}

export function conversionRate(history: OrderCounts, closedDrops: number): Conversion {
  if (closedDrops < MIN_DROPS_FOR_CONVERSION || history.ordersPlaced === 0) {
    return { rate: FALLBACK_CONVERSION, fallback: true }
  }
  return { rate: history.ordersPaid / history.ordersPlaced, fallback: false }
}

/** Open requested units (lapsed requests already left out by the caller) times the rate. */
export function likelyUnits(openRequestedUnits: number, rate: number): number {
  if (openRequestedUnits < 0) {
    throw new RangeError('Requested units cannot be negative')
  }
  return openRequestedUnits * rate
}
