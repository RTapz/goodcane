// O2: the owner's orders list, mark fulfilled and cancel (BR-O3, BR-O4, BR-O5).
import { and, desc, eq, inArray } from 'drizzle-orm'
import { maskPhone } from '../../domain/identity/phone'
import { decideFulfil, decideOwnerCancel, type OwnerActionDecision } from '../../domain/orders/owner-actions'
import { isRequestLapsed, type OrderStatus } from '../../domain/orders/requests'
import type { Db } from '../../db/client'
import { customers, drops, menuItems, orderHistory, orderItems, orders, payments } from '../../db/schema'
import { readSettings } from '../settings'

const LIST_LIMIT = 200

/** The statuses O2 can filter by. `lapsed` is a request past its limit (5.3 note). */
export type ListStatus = OrderStatus | 'lapsed'

export interface OwnerOrderView {
  id: string
  dropId: string
  dropAt: string
  firstName: string | null
  maskedPhone: string | null
  status: ListStatus
  fulfilment: 'pickup' | 'delivery'
  area: string | null
  totalPesewas: number
  createdAt: string
  lines: { name: string; size: string; quantity: number }[]
  /** BR-O4: a paid order was cancelled. */
  refundDue: boolean
  /** BR-O2: a payment went through but could not be confirmed, so no order was made. */
  unconfirmedPaymentRefundDue: boolean
  isSample: boolean
}

export async function listOwnerOrders(
  db: Db,
  filter: { dropId?: string; status?: ListStatus },
  now: Date
): Promise<OwnerOrderView[]> {
  const { request_expiry_days: expiryDays } = await readSettings(db, ['request_expiry_days'])

  // `lapsed` and `requested` are both stored as `requested`; they are split after loading.
  const stored: OrderStatus | undefined = filter.status === 'lapsed' ? 'requested' : filter.status
  const rows = await db
    .select({ order: orders, cutOffAt: drops.cutOffAt, dropAt: drops.dropAt, firstName: customers.firstName, phone: customers.phone })
    .from(orders)
    .innerJoin(drops, eq(drops.id, orders.dropId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(and(filter.dropId ? eq(orders.dropId, filter.dropId) : undefined, stored ? eq(orders.status, stored) : undefined))
    .orderBy(desc(orders.createdAt))

  const withStatus = rows
    .map((row) => ({
      ...row,
      status: (isRequestLapsed(row.order, row.cutOffAt, now, expiryDays) ? 'lapsed' : row.order.status) as ListStatus
    }))
    .filter((row) => !filter.status || row.status === filter.status)
    .slice(0, LIST_LIMIT)
  if (withStatus.length === 0) return []

  const ids = withStatus.map((row) => row.order.id)
  const lines = await db
    .select({ orderId: orderItems.orderId, name: menuItems.name, size: menuItems.size, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(inArray(orderItems.orderId, ids))
  const unconfirmed = await db
    .selectDistinct({ orderId: payments.orderId })
    .from(payments)
    .where(and(inArray(payments.orderId, ids), eq(payments.refundDue, true)))
  const refundForPayment = new Set(unconfirmed.map((p) => p.orderId))

  return withStatus.map(({ order, dropAt, firstName, phone, status }) => ({
    id: order.id,
    dropId: order.dropId,
    dropAt: dropAt.toISOString(),
    firstName,
    maskedPhone: phone ? maskPhone(phone) : null,
    status,
    fulfilment: order.fulfilment,
    area: order.area,
    totalPesewas: order.totalPesewas,
    createdAt: order.createdAt.toISOString(),
    lines: lines.filter((l) => l.orderId === order.id).map(({ name, size, quantity }) => ({ name, size, quantity })),
    refundDue: order.refundDue,
    unconfirmedPaymentRefundDue: refundForPayment.has(order.id),
    isSample: order.isSample
  }))
}

export type OwnerActionResult =
  | { kind: 'done'; status: OrderStatus; refundDue: boolean }
  | { kind: 'not_found' }
  | { kind: 'not_allowed'; status: OrderStatus }

/** Applies one owner action in one transaction, with the order row locked, and writes history. */
async function applyOwnerAction(
  db: Db,
  orderId: string,
  decide: (status: OrderStatus) => OwnerActionDecision,
  now: Date,
  demoMode: boolean
): Promise<OwnerActionResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
    if (!order) return { kind: 'not_found' }

    const decision = decide(order.status)
    if (!decision.ok) return { kind: 'not_allowed', status: order.status }

    await tx
      .update(orders)
      .set({
        status: decision.to,
        refundDue: order.refundDue || decision.refundDue,
        // A cancelled request's hold, if any, stops counting straight away.
        holdExpiresAt: decision.to === 'cancelled' ? null : order.holdExpiresAt
      })
      .where(eq(orders.id, orderId))
    await tx.insert(orderHistory).values({
      orderId,
      fromStatus: order.status,
      toStatus: decision.to,
      actor: 'owner',
      createdAt: now,
      isSample: demoMode
    })
    return { kind: 'done', status: decision.to, refundDue: order.refundDue || decision.refundDue }
  })
}

export function fulfilOrder(db: Db, orderId: string, ctx: { now: Date; demoMode: boolean }) {
  return applyOwnerAction(db, orderId, decideFulfil, ctx.now, ctx.demoMode)
}

export function cancelOrderAsOwner(db: Db, orderId: string, ctx: { now: Date; demoMode: boolean }) {
  return applyOwnerAction(db, orderId, decideOwnerCancel, ctx.now, ctx.demoMode)
}
