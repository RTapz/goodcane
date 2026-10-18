// BR-FC10 and BR-FC11: snapshots written lazily, and the scored (forecast, actual) pairs.
import { checkpointFor, snapshotAtCheckpoint, type ForecastPair, type HistoryDrop } from '../../domain/forecast'
import type { DbOrTx } from '../../db/client'
import { forecastSnapshots } from '../../db/schema'
import type { DropFact } from './facts'

export type SnapshotRow = typeof forecastSnapshots.$inferSelect

function historyOf(facts: DropFact[]): HistoryDrop[] {
  return facts.map((f) => ({
    cutOffAt: f.drop.cutOffAt,
    capacity: f.drop.capacity,
    paid: f.finalPaid,
    turnedAwayUnits: f.turnedAwayUnits
  }))
}

/**
 * Writes the snapshot of every drop whose checkpoint has passed and that has none yet.
 * The numbers are computed as of the nominal checkpoint, so a late first load writes exactly
 * what an on-time one would have. ON CONFLICT DO NOTHING on (drop_id, method) means two
 * loads at the same moment still write each snapshot once. Returns all snapshot rows.
 */
export async function ensureSnapshots(
  db: DbOrTx,
  facts: DropFact[],
  ctx: { now: Date; checkpointDays: number; demoMode: boolean }
): Promise<SnapshotRow[]> {
  const existing = await db.select().from(forecastSnapshots)
  const hasSnapshot = new Set(existing.map((s) => s.dropId))

  const toWrite: (typeof forecastSnapshots.$inferInsert)[] = []
  for (const fact of facts) {
    const checkpointAt = checkpointFor(fact.drop.cutOffAt, ctx.checkpointDays)
    if (hasSnapshot.has(fact.drop.id) || checkpointAt.getTime() > ctx.now.getTime()) continue

    const history = historyOf(facts.filter((f) => f.drop.id !== fact.drop.id))
    const snapshot = snapshotAtCheckpoint({ cutOffAt: fact.drop.cutOffAt, checkpointDays: ctx.checkpointDays, paid: fact.everPaid, history })
    const base = { dropId: fact.drop.id, checkpointAt: snapshot.checkpointAt, isSample: ctx.demoMode }
    if (snapshot.pace !== null) toWrite.push({ ...base, method: 'pace', projectedUnits: snapshot.pace })
    if (snapshot.baseline !== null) toWrite.push({ ...base, method: 'baseline', projectedUnits: snapshot.baseline })
  }

  if (toWrite.length === 0) return existing
  await db.insert(forecastSnapshots).values(toWrite).onConflictDoNothing({
    target: [forecastSnapshots.dropId, forecastSnapshots.method]
  })
  return db.select().from(forecastSnapshots)
}

/** Closed drops that have a pace snapshot, oldest first: (snapshot, final demand units). */
export function scoredPairs(facts: DropFact[], snapshots: SnapshotRow[], before?: Date): ForecastPair[] {
  const pace = new Map(snapshots.filter((s) => s.method === 'pace').map((s) => [s.dropId, s.projectedUnits]))
  return facts
    .filter((f) => f.closed && pace.has(f.drop.id) && (!before || f.drop.cutOffAt.getTime() < before.getTime()))
    .map((f) => ({ forecast: pace.get(f.drop.id) as number, actual: f.demandUnits }))
}
