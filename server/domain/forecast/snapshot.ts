// BR-FC10: the forecast as it stood at the checkpoint (sample: 3 days before cut-off).
//
// To score a forecast fairly later (BR-FC11) it must only use what was known at that moment.
// So this function takes everything and throws away what came later itself:
//   - payments for this drop count only if paid at or before the checkpoint and not cancelled by then,
//   - turned-away rows count only if recorded by then, deduped against who had paid by then (BR-F2),
//   - history only includes drops whose cut-off was before the checkpoint.
// That means it gives the same answer whether it runs on time, a day late, or in the seed.
import { weightedBaseline } from './baseline'
import { hitCapacity } from './capacity'
import { demandUnits } from './demand'
import { learnPaceTable, paceShareAt, type PaidUnits } from './pace'
import { MIN_DROPS_FOR_PACE, paceProjection } from './projection'
import { turnedAwayUnits, type TurnedAwayRow } from './turned-away'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface HistoryDrop {
  cutOffAt: Date
  capacity: number
  /** Final paid orders (paid_confirmed or fulfilled), with when each was paid. */
  paid: PaidUnits[]
  /** Turned-away units after the BR-F2 dedupe. */
  turnedAwayUnits: number
}

/** A paid order on the drop being forecast, and when it was cancelled if it was. */
export interface PaidOrder extends PaidUnits {
  customerId: string | null
  cancelledAt: Date | null
}

/** A turned-away row on the drop being forecast, with when it was recorded. */
export interface TurnedAwayAt extends TurnedAwayRow {
  createdAt: Date
}

export interface SnapshotInput {
  cutOffAt: Date
  checkpointDays: number
  /** Paid orders on the drop being forecast. Later payments and cancellations are ignored here. */
  paid: PaidOrder[]
  /** Turned-away rows on the drop being forecast. Later ones are ignored here. */
  turnedAway: TurnedAwayAt[]
  /** Other drops. Ones that closed after the checkpoint are ignored here. */
  history: HistoryDrop[]
}

export interface Snapshot {
  checkpointAt: Date
  /** Rounded units, or null when it could not be worked out at that moment. */
  pace: number | null
  baseline: number | null
}

const sumUnits = (paid: PaidUnits[]) => paid.reduce((sum, p) => sum + p.units, 0)

/** Paid at or before the checkpoint, and not cancelled by then. */
function paidAtCheckpoint(order: PaidOrder, checkpointAt: Date): boolean {
  if (order.paidAt.getTime() > checkpointAt.getTime()) return false
  return order.cancelledAt === null || order.cancelledAt.getTime() > checkpointAt.getTime()
}

export function checkpointFor(cutOffAt: Date, checkpointDays: number): Date {
  return new Date(cutOffAt.getTime() - checkpointDays * MS_PER_DAY)
}

export function snapshotAtCheckpoint(input: SnapshotInput): Snapshot {
  const checkpointAt = checkpointFor(input.cutOffAt, input.checkpointDays)

  // Only drops that had already closed by the checkpoint, oldest first.
  const known = input.history
    .filter((drop) => drop.cutOffAt.getTime() < checkpointAt.getTime())
    .sort((a, b) => a.cutOffAt.getTime() - b.cutOffAt.getTime())

  const baseline = weightedBaseline(known.map((drop) => demandUnits(sumUnits(drop.paid), drop.turnedAwayUnits)))

  let pace: number | null = null
  // Drops that sold out are left out of the pace table (section 9), and so are drops with nothing
  // paid, which have no shape to learn from.
  const forPace = known.filter((drop) => sumUnits(drop.paid) > 0 && !hitCapacity(sumUnits(drop.paid), drop.capacity))
  if (known.length >= MIN_DROPS_FOR_PACE && forPace.length > 0) {
    const share = paceShareAt(learnPaceTable(forPace), input.checkpointDays)
    // Demand so far (BR-FC4), so the forecast and the actual it is scored against are both
    // demand units: paid by the checkpoint plus turned away by then, without counting anyone twice.
    const paidByCheckpoint = input.paid.filter((p) => paidAtCheckpoint(p, checkpointAt))
    const paidCustomers = new Set(paidByCheckpoint.flatMap((p) => (p.customerId ? [p.customerId] : [])))
    const turnedAwayByCheckpoint = input.turnedAway.filter((t) => t.createdAt.getTime() <= checkpointAt.getTime())
    const demandSoFar = sumUnits(paidByCheckpoint) + turnedAwayUnits(turnedAwayByCheckpoint, paidCustomers)
    const projection = share.ok ? paceProjection(demandSoFar, share.value) : null
    pace = projection?.ok ? Math.round(projection.value) : null
  }

  return { checkpointAt, pace, baseline: baseline.ok ? Math.round(baseline.value) : null }
}
