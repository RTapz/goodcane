// Deleting customers' personal data (BR-DP1 to BR-DP3). applyPurge carries out purgeCustomer for
// one customer inside the caller's transaction; purgeInactiveCustomers is what `pnpm retention` runs.
import { and, asc, eq, isNull, lt } from 'drizzle-orm'
import { inactiveCutOff, purgeCustomer } from '../domain/retention'
import type { Db, DbOrTx, Tx } from '../db/client'
import { accessTokens, customers, orders, reminders } from '../db/schema'
import { readSettings } from './settings'

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

async function cutOff(db: DbOrTx, now: Date): Promise<Date> {
  const { retention_months: months } = await readSettings(db, ['retention_months'])
  return inactiveCutOff(now, months)
}

/**
 * BR-DP1: customers not deleted whose last activity (an order, a payment or a reminder-setting
 * change; never a link opening) is before the retention cut-off. Ids only.
 */
export async function findInactiveCustomers(db: DbOrTx, now: Date): Promise<string[]> {
  const before = await cutOff(db, now)
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(isNull(customers.deletedAt), lt(customers.lastActiveAt, before)))
    .orderBy(asc(customers.lastActiveAt))
  return rows.map((r) => r.id)
}

/**
 * BR-DP3: purges every inactive customer, each in its own transaction, re-checking inside it so
 * someone who became active a moment ago is left alone. A dry run only counts. Counts only.
 */
export async function purgeInactiveCustomers(db: Db, now: Date, options: { dryRun: boolean }): Promise<{ inactive: number; purged: number }> {
  const ids = await findInactiveCustomers(db, now)
  if (options.dryRun) return { inactive: ids.length, purged: 0 }
  const before = await cutOff(db, now)
  let purged = 0
  for (const id of ids) {
    const done = await db.transaction(async (tx) => {
      const [still] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), isNull(customers.deletedAt), lt(customers.lastActiveAt, before)))
        .for('update')
      return still ? applyPurge(tx, id, now) : false
    })
    if (done) purged += 1
  }
  return { inactive: ids.length, purged }
}
