// Order summary for C4, only for the customer who owns it (BR-L7).
import { and, eq } from 'drizzle-orm'
import { maskPhone } from '../../domain/identity/phone'
import { isRequestLapsed } from '../../domain/orders/requests'
import type { DbOrTx } from '../../db/client'
import { customers, drops, menuItems, orderItems, orders } from '../../db/schema'
import { readSettings } from '../settings'

export async function getOrderForCustomer(db: DbOrTx, orderId: string, customerId: string, now: Date) {
  const [row] = await db
    .select({ order: orders, drop: drops, customer: { firstName: customers.firstName, phone: customers.phone } })
    .from(orders)
    .innerJoin(drops, eq(drops.id, orders.dropId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
  if (!row) return null

  const lines = await db
    .select({
      menuItemId: orderItems.menuItemId,
      name: menuItems.name,
      size: menuItems.size,
      quantity: orderItems.quantity,
      unitPricePesewas: orderItems.unitPricePesewas
    })
    .from(orderItems)
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(menuItems.name, menuItems.size)

  const { hold_minutes: holdMinutes, request_expiry_days: expiryDays } = await readSettings(db, [
    'hold_minutes',
    'request_expiry_days'
  ])
  const { order, drop, customer } = row
  const itemsPesewas = lines.reduce((sum, l) => sum + l.quantity * l.unitPricePesewas, 0)

  return {
    id: order.id,
    status: order.status,
    lapsed: isRequestLapsed(order, drop.cutOffAt, now, expiryDays),
    drop: {
      id: drop.id,
      dropAt: drop.dropAt.toISOString(),
      cutOffAt: drop.cutOffAt.toISOString(),
      closed: drop.status !== 'open' || now.getTime() >= drop.cutOffAt.getTime()
    },
    lines,
    fulfilment: order.fulfilment,
    address: order.address,
    area: order.area,
    itemsPesewas,
    feePesewas: order.feePesewas,
    totalPesewas: order.totalPesewas,
    firstName: customer.firstName ?? '',
    phoneMasked: customer.phone ? maskPhone(customer.phone) : '',
    holdMinutes,
    serverNow: now.toISOString()
  }
}

export type OrderSummary = NonNullable<Awaited<ReturnType<typeof getOrderForCustomer>>>
