// O3 Close batch (spec 5.10, BR-B1 to B4). One transaction with the drop row locked; the rules
// are in server/domain/batch/close.ts. Orders sold come from the same query as spaces left.
import { and, eq, gt, ne } from 'drizzle-orm'
import { closeBatch, closeMode, type CloseMode } from '../../domain/batch/close'
import type { Db, DbOrTx } from '../../db/client'
import { drops } from '../../db/schema'
import { dropUsage } from '../capacity'

/** Open drops other than this one that customers can still order for. */
async function otherOpenDrops(db: DbOrTx, dropId: string, now: Date): Promise<number> {
  const rows = await db
    .select({ id: drops.id })
    .from(drops)
    .where(and(eq(drops.status, 'open'), gt(drops.cutOffAt, now), ne(drops.id, dropId)))
  return rows.length
}

async function ordersSold(db: DbOrTx, dropId: string, now: Date): Promise<number> {
  return (await dropUsage(db, [dropId], now)).get(dropId)?.confirmedUnits ?? 0
}

export interface CloseInfo {
  drop: { id: string; dropAt: string; cutOffAt: string; status: string }
  ordersSold: number
  mode: CloseMode
  /** Set once the batch is closed. */
  stored: { unitsMade: number; unplannedSold: number; wasted: number; closedAt: string } | null
}

/** What O3 shows before closing: orders sold and whether, and how, the drop can be closed. */
export async function closeInfo(db: Db, dropId: string, ctx: { now: Date; demoMode: boolean }): Promise<CloseInfo | null> {
  const [drop] = await db.select().from(drops).where(eq(drops.id, dropId))
  if (!drop) return null
  return {
    drop: { id: drop.id, dropAt: drop.dropAt.toISOString(), cutOffAt: drop.cutOffAt.toISOString(), status: drop.status },
    ordersSold: await ordersSold(db, drop.id, ctx.now),
    mode: closeMode({ ...drop, now: ctx.now, demoMode: ctx.demoMode, otherOpenDrops: await otherOpenDrops(db, drop.id, ctx.now) }),
    stored:
      drop.status === 'completed' && drop.unitsMade !== null && drop.unplannedSold !== null
        ? { unitsMade: drop.unitsMade, unplannedSold: drop.unplannedSold, wasted: drop.unitsWasted ?? 0, closedAt: (drop.closedAt ?? drop.cutOffAt).toISOString() }
        : null
  }
}

export type CloseResult =
  | { kind: 'closed'; ordersSold: number; unitsMade: number; unplannedSold: number; wasted: number; warning: { difference: number } | null }
  | { kind: 'already_closed'; ordersSold: number; unitsMade: number; unplannedSold: number; wasted: number }
  | { kind: 'refused'; reason: 'not_past_cut_off' | 'last_open_drop' | 'negative_wasted' }
  | { kind: 'not_found' }

export async function closeDrop(
  db: Db,
  dropId: string,
  input: { unitsMade: number; unplannedSold: number; wasted?: number | null },
  ctx: { now: Date; demoMode: boolean }
): Promise<CloseResult> {
  return db.transaction(async (tx) => {
    const [drop] = await tx.select().from(drops).where(eq(drops.id, dropId)).for('update')
    if (!drop) return { kind: 'not_found' }
    const sold = await ordersSold(tx, drop.id, ctx.now)

    // Idempotent: a closed batch is never overwritten; a repeat gets the stored numbers.
    if (drop.status === 'completed') {
      return {
        kind: 'already_closed',
        ordersSold: sold,
        unitsMade: drop.unitsMade ?? 0,
        unplannedSold: drop.unplannedSold ?? 0,
        wasted: drop.unitsWasted ?? 0
      }
    }

    const mode = closeMode({ ...drop, now: ctx.now, demoMode: ctx.demoMode, otherOpenDrops: await otherOpenDrops(tx, drop.id, ctx.now) })
    if (!mode.ok) return { kind: 'refused', reason: mode.reason === 'already_closed' ? 'not_past_cut_off' : mode.reason }

    const batch = closeBatch({ ordersSold: sold, ...input })
    if (!batch.ok) return { kind: 'refused', reason: batch.reason }

    await tx
      .update(drops)
      .set({
        unitsMade: input.unitsMade,
        unplannedSold: input.unplannedSold,
        unitsWasted: batch.wasted,
        status: 'completed',
        closedAt: ctx.now
      })
      .where(eq(drops.id, drop.id))
    return {
      kind: 'closed',
      ordersSold: sold,
      unitsMade: input.unitsMade,
      unplannedSold: input.unplannedSold,
      wasted: batch.wasted,
      warning: batch.warning
    }
  })
}
