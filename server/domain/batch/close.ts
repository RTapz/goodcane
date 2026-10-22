// Close batch (spec 5.10, BR-B1 to B4). Pure: the service loads the drop and paid units and
// applies the result; the O3 page uses closeBatch for its live preview.

export interface BatchInput {
  /** Paid units in the drop (paid and confirmed, or fulfilled): the system knows these (BR-B2). */
  ordersSold: number
  unitsMade: number
  unplannedSold: number
  /** Optional (BR-B1): calculated when left out (BR-B3). */
  wasted?: number | null
}

export type BatchResult =
  | {
      ok: true
      wasted: number
      /** Non-blocking (BR-B3): made minus (sold + unplanned + wasted), when all three were entered and do not add up. */
      warning: { difference: number } | null
    }
  | { ok: false; reason: 'negative_wasted' }

export function closeBatch(input: BatchInput): BatchResult {
  const accountedBeforeWaste = input.ordersSold + input.unplannedSold
  if (input.wasted === undefined || input.wasted === null) {
    const wasted = input.unitsMade - accountedBeforeWaste
    if (wasted < 0) return { ok: false, reason: 'negative_wasted' }
    return { ok: true, wasted, warning: null }
  }
  const difference = input.unitsMade - (accountedBeforeWaste + input.wasted)
  return { ok: true, wasted: input.wasted, warning: difference === 0 ? null : { difference } }
}

/** What the O3 confirmation says before a demo early close (BR-B4). */
export const EARLY_CLOSE_WARNING = 'Closing early removes this drop from customers until the next reseed.'

export type CloseMode =
  | { ok: true; mode: 'after_cut_off' | 'demo_early' }
  | { ok: false; reason: 'already_closed' | 'not_past_cut_off' | 'last_open_drop' }

/**
 * Whether a drop can be closed now (BR-B4). After the cut-off: always. Before it: only in demo
 * mode, and only while another open drop remains, so customers always have one to order for.
 */
export function closeMode(args: {
  status: 'open' | 'closed' | 'completed'
  cutOffAt: Date
  now: Date
  demoMode: boolean
  /** Open drops other than this one. */
  otherOpenDrops: number
}): CloseMode {
  if (args.status === 'completed') return { ok: false, reason: 'already_closed' }
  if (args.now.getTime() >= args.cutOffAt.getTime()) return { ok: true, mode: 'after_cut_off' }
  if (!args.demoMode) return { ok: false, reason: 'not_past_cut_off' }
  if (args.otherOpenDrops < 1) return { ok: false, reason: 'last_open_drop' }
  return { ok: true, mode: 'demo_early' }
}
