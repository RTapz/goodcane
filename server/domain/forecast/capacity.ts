// A drop that sold out tells us the pace of the early buyers only: the late buyers were turned
// away, so their payments never happened. Learning the pace table from such a drop would make
// orders look like they arrive earlier than they really do, so those drops are left out of it
// (spec section 9). They still count towards demand, through their turned-away units (BR-FC1).

export function hitCapacity(paidUnits: number, capacity: number): boolean {
  return paidUnits >= capacity
}
