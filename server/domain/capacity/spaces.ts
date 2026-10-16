export interface CapacityUse {
  capacity: number
  /** Units in paid and confirmed (or fulfilled) orders. */
  confirmedUnits: number
  /** Units in holds that have not expired yet. */
  heldUnits: number
}

/** Spaces left in a drop: capacity minus paid units minus active holds, never below 0 (BR-C2). */
export function spacesLeft({ capacity, confirmedUnits, heldUnits }: CapacityUse): number {
  return Math.max(0, capacity - confirmedUnits - heldUnits)
}

/** True when `units` more can still go into a drop with `spaces` left. */
export function fitsInDrop(units: number, spaces: number): boolean {
  return units <= spaces
}
