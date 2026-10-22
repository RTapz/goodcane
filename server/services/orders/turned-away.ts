// BR-F2 for a completely full drop: someone who could not order says how many they wanted. One
// transaction with the drop row locked, so "no room" is checked against the same numbers customers
// see. Writes one drop_full row per idempotency key and nothing else: no order, hold or customer.
import { eq } from 'drizzle-orm'
import { fitsInDrop, spacesLeft } from '../../domain/capacity'
import type { Db } from '../../db/client'
import { drops, turnedAway } from '../../db/schema'
import { dropUsage } from '../capacity'

export type TurnedAwayResult =
  | { kind: 'recorded' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: 'unknown_drop' | 'drop_closed' | 'has_space' }

export async function recordTurnedAway(
  db: Db,
  input: { dropId: string; units: number; idempotencyKey: string; customerId: string | null },
  ctx: { now: Date; demoMode: boolean }
): Promise<TurnedAwayResult> {
  return db.transaction(async (tx) => {
    const [drop] = await tx.select().from(drops).where(eq(drops.id, input.dropId)).for('update')
    if (!drop) return { kind: 'refused', reason: 'unknown_drop' }
    if (drop.status !== 'open' || ctx.now.getTime() >= drop.cutOffAt.getTime()) return { kind: 'refused', reason: 'drop_closed' }

    const usage = (await dropUsage(tx, [drop.id], ctx.now)).get(drop.id) ?? { confirmedUnits: 0, heldUnits: 0 }
    if (fitsInDrop(input.units, spacesLeft({ capacity: drop.capacity, ...usage }))) return { kind: 'refused', reason: 'has_space' }

    const inserted = await tx
      .insert(turnedAway)
      .values({
        dropId: drop.id,
        orderId: null,
        customerId: input.customerId,
        idempotencyKey: input.idempotencyKey,
        units: input.units,
        reason: 'drop_full',
        createdAt: ctx.now,
        isSample: ctx.demoMode
      })
      .onConflictDoNothing({ target: turnedAway.idempotencyKey })
      .returning({ id: turnedAway.id })
    return inserted.length > 0 ? { kind: 'recorded' } : { kind: 'replayed' }
  })
}
