// C9: one customer's own orders, from their session only (BR-L7). No phone and no address.
import { desc, eq, inArray } from 'drizzle-orm'
import { decideCustomerCancel } from '../domain/orders/customer-cancel'
import { isRequestLapsed, type OrderStatus } from '../domain/orders/requests'
import type { DbOrTx } from '../db/client'
import { drops, menuItems, orderItems, orders } from '../db/schema'
import { readSettings } from './settings'

export interface MyOrder {
  id: string
  dropAt: string
  cutOffAt: string
  /** `lapsed` is a request past its limit, shown as such until a job writes `expired`. */
  status: OrderStatus | 'lapsed'
  fulfilment: 'pickup' | 'delivery'
  totalPesewas: number
  refundDue: boolean
  /** Whether "Cancel this order" is offered now (BR-X3); the server decides again on cancel. */
  canCancel: boolean
  lines: { name: string; size: string; quantity: number }[]
}

export async function myOrders(db: DbOrTx, customerId: string, now: Date): Promise<MyOrder[]> {
  const { request_expiry_days: expiryDays } = await readSettings(db, ['request_expiry_days'])
  const rows = await db
    .select({ order: orders, dropAt: drops.dropAt, cutOffAt: drops.cutOffAt })
    .from(orders)
    .innerJoin(drops, eq(drops.id, orders.dropId))
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(drops.dropAt), desc(orders.createdAt))
    .limit(50)
  if (rows.length === 0) return []

  const lines = await db
    .select({ orderId: orderItems.orderId, name: menuItems.name, size: menuItems.size, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(inArray(orderItems.orderId, rows.map((r) => r.order.id)))

  return rows.map(({ order, dropAt, cutOffAt }) => {
    const lapsed = isRequestLapsed(order, cutOffAt, now, expiryDays)
    return {
      id: order.id,
      dropAt: dropAt.toISOString(),
      cutOffAt: cutOffAt.toISOString(),
      status: lapsed ? 'lapsed' : order.status,
      fulfilment: order.fulfilment,
      totalPesewas: order.totalPesewas,
      refundDue: order.refundDue,
      canCancel: decideCustomerCancel({ status: order.status, lapsed, cutOffAt, now }).ok,
      lines: lines.filter((l) => l.orderId === order.id).map(({ name, size, quantity }) => ({ name, size, quantity }))
    }
  })
}
