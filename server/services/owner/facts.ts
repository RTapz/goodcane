// Loads drops and orders once and works out the per-drop numbers the owner screens need.
// The demo has a few hundred orders, so reading them all is simpler and safer than many
// narrow queries. Everything is in capacity-weighted units (BR-C1).
import { asc, eq, sql } from 'drizzle-orm'
import { turnedAwayUnits, type PaidOrder, type PaidUnits } from '../../domain/forecast'
import { isRequestLapsed, type OrderStatus } from '../../domain/orders/requests'
import type { DbOrTx } from '../../db/client'
import { drops, menuItems, orderHistory, orderItems, orders, turnedAway } from '../../db/schema'

const FINAL_PAID: OrderStatus[] = ['paid_confirmed', 'fulfilled']

export type DropRow = typeof drops.$inferSelect

export interface OrderFact {
  id: string
  dropId: string
  customerId: string | null
  status: OrderStatus
  createdAt: Date
  paidAt: Date | null
  cancelledAt: Date | null
  cancelledBy: 'customer' | 'owner' | 'system' | null
  units: number
  /** A request past its limit, shown as lapsed until a job writes `expired`. */
  lapsed: boolean
}

export interface DropFact {
  drop: DropRow
  /** Cut-off has passed, so its numbers are final (glossary: closed). */
  closed: boolean
  orders: OrderFact[]
  /** Units in orders that are paid now (paid_confirmed or fulfilled). */
  paidUnits: number
  /** Those orders with when each was paid, for the pace table. */
  finalPaid: PaidUnits[]
  /** Every order that was ever paid, with any cancellation time, for snapshots. */
  everPaid: PaidOrder[]
  /** Requested, unpaid and not lapsed (5.3 note). */
  openRequestedUnits: number
  /** After the BR-F2 dedupe. */
  turnedAwayUnits: number
  /** BR-FC1: paid plus turned away. */
  demandUnits: number
  ordersPlaced: number
  ordersPaid: number
}

export async function loadDropFacts(db: DbOrTx, now: Date, expiryDays: number): Promise<DropFact[]> {
  const dropRows = await db.select().from(drops).orderBy(asc(drops.cutOffAt))

  const orderRows = await db
    .select({
      id: orders.id,
      dropId: orders.dropId,
      customerId: orders.customerId,
      status: orders.status,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      units: sql<number>`coalesce(sum(${orderItems.quantity} * ${menuItems.capacityWeight}), 0)::int`
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .groupBy(orders.id)

  const cancellations = await db
    .select({ orderId: orderHistory.orderId, actor: orderHistory.actor, createdAt: orderHistory.createdAt })
    .from(orderHistory)
    .where(eq(orderHistory.toStatus, 'cancelled'))
  const cancelled = new Map(cancellations.map((c) => [c.orderId, c]))

  const turnedAwayRows = await db
    .select({ dropId: turnedAway.dropId, units: turnedAway.units, customerId: orders.customerId })
    .from(turnedAway)
    .leftJoin(orders, eq(orders.id, turnedAway.orderId))

  return dropRows.map((drop) => {
    const facts: OrderFact[] = orderRows
      .filter((o) => o.dropId === drop.id)
      .map((o) => ({
        ...o,
        cancelledAt: cancelled.get(o.id)?.createdAt ?? null,
        cancelledBy: cancelled.get(o.id)?.actor ?? null,
        lapsed: isRequestLapsed(o, drop.cutOffAt, now, expiryDays)
      }))

    const paidNow = facts.filter((o) => FINAL_PAID.includes(o.status))
    const paidCustomers = new Set(paidNow.flatMap((o) => (o.customerId ? [o.customerId] : [])))
    const paidUnits = paidNow.reduce((sum, o) => sum + o.units, 0)
    const turnedAwayTotal = turnedAwayUnits(
      turnedAwayRows.filter((t) => t.dropId === drop.id),
      paidCustomers
    )

    return {
      drop,
      closed: drop.cutOffAt.getTime() <= now.getTime(),
      orders: facts,
      paidUnits,
      finalPaid: paidNow.map((o) => ({ paidAt: o.paidAt as Date, units: o.units })),
      everPaid: facts
        .filter((o) => o.paidAt !== null)
        .map((o) => ({ paidAt: o.paidAt as Date, units: o.units, cancelledAt: o.cancelledAt })),
      openRequestedUnits: facts.filter((o) => o.status === 'requested' && !o.lapsed).reduce((sum, o) => sum + o.units, 0),
      turnedAwayUnits: turnedAwayTotal,
      demandUnits: paidUnits + turnedAwayTotal,
      ordersPlaced: facts.length,
      ordersPaid: facts.filter((o) => o.paidAt !== null).length
    }
  })
}
