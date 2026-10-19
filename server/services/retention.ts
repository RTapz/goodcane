// Applies purgeCustomer (BR-DP2) inside the caller's transaction, with the customer row locked.
// pnpm retention (BR-DP3, not built yet) will call this for each inactive customer.
import { and, eq } from 'drizzle-orm'
import { purgeCustomer } from '../domain/retention'
import type { Tx } from '../db/client'
import { accessTokens, customers, orders, reminders } from '../db/schema'

/** Returns false when there is no such customer. Running it twice changes nothing the second time. */
export async function applyPurge(tx: Tx, customerId: string, now: Date): Promise<boolean> {
  const [customer] = await tx
    .select({ id: customers.id, deletedAt: customers.deletedAt })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update')
  if (!customer) return false

  const changes = purgeCustomer(customer, now)
  await tx.update(customers).set(changes.customer).where(eq(customers.id, customerId))
  await tx.update(orders).set(changes.orders).where(eq(orders.customerId, customerId))
  if (changes.deleteTokens) await tx.delete(accessTokens).where(eq(accessTokens.customerId, customerId))
  if (changes.deleteQueuedReminders) {
    await tx.delete(reminders).where(and(eq(reminders.customerId, customerId), eq(reminders.status, 'queued')))
  }
  return true
}
