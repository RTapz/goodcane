// The simulated payment provider callback (BR-P1 to BR-P5, BR-O2). No real payment code.
// Idempotent by reference: a repeated reference returns the stored result and changes nothing.
import { and, eq } from 'drizzle-orm'
import { decidePaymentSuccess } from '../../domain/orders/holds'
import type { Db, Tx } from '../../db/client'
import { customers, orderHistory, orders, payments, turnedAway } from '../../db/schema'
import { hasActiveLink, issueLink } from '../links'
import { loadLockedOrder } from '../orders/locked-order'

export type PaymentOutcome = 'success' | 'failed' | 'no_response'
type StoredResult = 'confirmed' | 'not_confirmed' | 'hold_kept'

export interface SimulateResult {
  kind: 'processed' | 'replayed'
  result: StoredResult
  reason: string | null
  refundDue: boolean
  /** Raw private link, only on the first confirmation for a customer without a link. */
  privateLinkToken: string | null
}

export type SimulateOutcome = SimulateResult | { kind: 'not_found' } | { kind: 'reference_conflict' }

class Done extends Error {
  constructor(readonly outcome: SimulateOutcome) {
    super(outcome.kind)
  }
}

async function replay(db: Db | Tx, reference: string, orderId: string, customerId: string): Promise<SimulateOutcome | null> {
  const [stored] = await db
    .select({ payment: payments, customerId: orders.customerId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.reference, reference))
  if (!stored) return null
  if (stored.payment.orderId !== orderId || stored.customerId !== customerId) {
    return { kind: 'reference_conflict' }
  }
  const { result, reason, refundDue } = stored.payment
  return { kind: 'replayed', result, reason, refundDue, privateLinkToken: null }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export async function simulatePayment(
  db: Db,
  input: { orderId: string; reference: string; outcome: PaymentOutcome },
  ctx: { now: Date; customerId: string; demoMode: boolean }
): Promise<SimulateOutcome> {
  const { orderId, reference, outcome } = input
  const { now, customerId, demoMode } = ctx

  try {
    return await db.transaction(async (tx) => {
      const previous = await replay(tx, reference, orderId, customerId)
      if (previous) throw new Done(previous)

      const loaded = await loadLockedOrder(tx, orderId, customerId, now)
      if (!loaded) throw new Done({ kind: 'not_found' })

      const record = async (result: StoredResult, reason: string | null, refundDue: boolean) => {
        await tx.insert(payments).values({
          orderId,
          reference,
          outcome,
          result,
          reason,
          refundDue,
          createdAt: now,
          isSample: demoMode
        })
      }

      // Failed or no response: nothing changes, the hold stays until it expires (BR-P4).
      if (outcome !== 'success') {
        await record('hold_kept', null, false)
        return { kind: 'processed', result: 'hold_kept', reason: null, refundDue: false, privateLinkToken: null } as const
      }

      const decision = decidePaymentSuccess({ ...loaded, now })
      if (decision.kind === 'not_confirmed') {
        // Money would have been taken by a real provider, so it is due back (BR-O2).
        await record('not_confirmed', decision.reason, true)
        if (decision.reason === 'not_enough_space' || decision.reason === 'drop_closed') {
          // BR-F2: could not be served in the drop they wanted. Once per order.
          await tx
            .insert(turnedAway)
            .values({
              dropId: loaded.drop.id,
              orderId,
              units: loaded.units,
              reason: decision.reason,
              createdAt: now,
              isSample: demoMode
            })
            .onConflictDoNothing({ target: turnedAway.orderId })
        }
        return { kind: 'processed', result: 'not_confirmed', reason: decision.reason, refundDue: true, privateLinkToken: null } as const
      }

      // Confirm (BR-O2): paid, hold cleared, history written, all in this transaction.
      await tx
        .update(orders)
        .set({ status: 'paid_confirmed', paidAt: now, holdExpiresAt: null })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'requested')))
      await tx.insert(orderHistory).values({
        orderId,
        fromStatus: 'requested',
        toStatus: 'paid_confirmed',
        actor: 'system',
        createdAt: now,
        isSample: demoMode
      })
      await record('confirmed', null, false)
      await tx.update(customers).set({ lastActiveAt: now }).where(eq(customers.id, customerId))

      // BR-L4: the private link is created here and shown once, on C6.
      const privateLinkToken = (await hasActiveLink(tx, customerId)) ? null : await issueLink(tx, customerId, now, demoMode)
      return { kind: 'processed', result: 'confirmed', reason: null, refundDue: false, privateLinkToken } as const
    })
  } catch (error) {
    if (error instanceof Done) return error.outcome
    // The same reference raced in parallel: the loser rolled back. Return the stored result.
    if (isUniqueViolation(error)) {
      const previous = await replay(db, reference, orderId, customerId)
      if (previous) return previous
    }
    throw error
  }
}
