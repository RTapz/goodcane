// BR-FC12: how predictable a drop was, the headline measure for the pilot.
//
// Of everything sold, what share was pre-ordered? 45 pre-ordered and 15 unplanned means
// 45 / (45 + 15) = 75% was known before the drop was made. A higher share means GoodCane
// produces less "blind". If nothing sold at all there is no share to report.
import { available, unavailable, type Maybe } from './result'

export function plannedShare(preorderedUnits: number, unplannedUnits: number): Maybe<number, 'no_sales'> {
  const total = preorderedUnits + unplannedUnits
  if (total <= 0) {
    return unavailable('no_sales')
  }
  return available(preorderedUnits / total)
}
