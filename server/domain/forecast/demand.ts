// BR-FC1: how much a finished drop was really wanted.
//
// Paid units alone undercount a drop that sold out: people who were turned away wanted to buy
// too. So demand = what was paid for + what we had to turn away.

export function demandUnits(paidUnits: number, turnedAwayUnits: number): number {
  if (paidUnits < 0 || turnedAwayUnits < 0) {
    throw new RangeError('Units cannot be negative')
  }
  return paidUnits + turnedAwayUnits
}
