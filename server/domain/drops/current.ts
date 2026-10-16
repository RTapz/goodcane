export interface OpenDrop {
  id: string
  dropAt: Date
  cutOffAt: Date
}

export interface NextDropChoice<T extends OpenDrop> {
  /** The drop customers can order for now, or null if none is scheduled. */
  drop: T | null
  /** The drop after it, offered when `drop` is full (never chosen silently, BR-F1). */
  nextDrop: T | null
  /** Set when an open drop's cut-off has passed: its orders are closed (BR-D4). */
  missedDrop: T | null
  closed: boolean
}

/**
 * Picks the drop to order for from drops with status `open`.
 * Orders are accepted only while now is before cut-off (BR-D3), so a drop whose
 * cut-off has passed is reported as missed, and the next one is offered instead.
 */
export function pickNextDrop<T extends OpenDrop>(openDrops: T[], now: Date): NextDropChoice<T> {
  const sorted = [...openDrops].sort((a, b) => a.dropAt.getTime() - b.dropAt.getTime())
  const passed = sorted.filter((d) => d.cutOffAt.getTime() <= now.getTime())
  const ahead = sorted.filter((d) => d.cutOffAt.getTime() > now.getTime())
  const missedDrop = passed.at(-1) ?? null

  return {
    drop: ahead[0] ?? null,
    nextDrop: ahead[1] ?? null,
    missedDrop,
    closed: missedDrop !== null
  }
}
