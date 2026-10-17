// The returning customer, from their session only (BR-L7). Masked phone (BR-L8), no address.
import { and, desc, eq, inArray } from 'drizzle-orm'
import { maskPhone } from '../domain/identity/phone'
import { consentState } from '../domain/reminders/consent'
import type { DbOrTx } from '../db/client'
import { consentEvents, customers, menuItems, orderItems, orders } from '../db/schema'

export async function latestConsent(db: DbOrTx, customerId: string) {
  const [latest] = await db
    .select({ action: consentEvents.action, channel: consentEvents.channel })
    .from(consentEvents)
    .where(eq(consentEvents.customerId, customerId))
    .orderBy(desc(consentEvents.createdAt), desc(consentEvents.id))
    .limit(1)
  return latest ?? null
}

export async function getMe(db: DbOrTx, customerId: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId))
  if (!customer || customer.deletedAt) return null

  const state = consentState(await latestConsent(db, customerId))
  const [last] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), inArray(orders.status, ['paid_confirmed', 'fulfilled'])))
    .orderBy(desc(orders.paidAt))
    .limit(1)

  const lines = last
    ? await db
        .select({
          menuItemId: orderItems.menuItemId,
          name: menuItems.name,
          tasteGroup: menuItems.tasteGroup,
          size: menuItems.size,
          quantity: orderItems.quantity,
          unitPricePesewas: orderItems.unitPricePesewas
        })
        .from(orderItems)
        .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
        .where(eq(orderItems.orderId, last.id))
        .orderBy(menuItems.name, menuItems.size)
    : []

  return {
    firstName: customer.firstName ?? '',
    phoneMasked: customer.phone ? maskPhone(customer.phone) : '',
    reminders: {
      state,
      channel: state === 'opted_in' ? customer.reminderChannel : null,
      frequency: state === 'opted_in' ? customer.reminderFrequency : null
    },
    lastOrder: last
      ? {
          orderId: last.id,
          dropId: last.dropId,
          fulfilment: last.fulfilment,
          area: last.area,
          feePesewas: last.feePesewas,
          lines
        }
      : null
  }
}

export type Me = NonNullable<Awaited<ReturnType<typeof getMe>>>

/** Saved details for a reorder: never sent to the browser. */
export async function savedDetails(db: DbOrTx, customerId: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId))
  if (!customer || customer.deletedAt || !customer.firstName || !customer.phone) return null
  const [lastDelivery] = await db
    .select({ address: orders.address })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.fulfilment, 'delivery'),
        inArray(orders.status, ['paid_confirmed', 'fulfilled'])
      )
    )
    .orderBy(desc(orders.paidAt))
    .limit(1)
  return { firstName: customer.firstName, phone: customer.phone, lastAddress: lastDelivery?.address ?? null }
}
