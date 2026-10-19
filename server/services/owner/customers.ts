// O7 "Customers" (minimal): masked phones only (BR-L8), search by first name, and "Send new link"
// (BR-L6). The owner never sees a token issued earlier: only hashes are stored, and the new raw
// link exists only in the response that creates it.
import { and, desc, eq, ilike, isNull } from 'drizzle-orm'
import { maskPhone } from '../../domain/identity/phone'
import type { Db } from '../../db/client'
import { customers } from '../../db/schema'
import { issueLink } from '../links'

const LIST_LIMIT = 50

export interface OwnerCustomerView {
  id: string
  firstName: string | null
  maskedPhone: string | null
  lastActiveAt: string
}

/** Customers whose first name contains `query` (any case), most recently active first. Deleted ones are left out. */
export async function listOwnerCustomers(db: Db, query: string): Promise<OwnerCustomerView[]> {
  // Escape LIKE wildcards so a search for "%" or "_" matches only those characters.
  const pattern = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const rows = await db
    .select({ id: customers.id, firstName: customers.firstName, phone: customers.phone, lastActiveAt: customers.lastActiveAt })
    .from(customers)
    .where(and(isNull(customers.deletedAt), ilike(customers.firstName, pattern)))
    .orderBy(desc(customers.lastActiveAt))
    .limit(LIST_LIMIT)
  return rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    maskedPhone: r.phone ? maskPhone(r.phone) : null,
    lastActiveAt: r.lastActiveAt.toISOString()
  }))
}

/** A new private link for the customer; the old one is revoked (BR-L6). Null for an unknown or deleted customer. */
export async function sendNewLink(db: Db, customerId: string, now: Date, demoMode: boolean): Promise<{ token: string } | null> {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select({ id: customers.id, deletedAt: customers.deletedAt })
      .from(customers)
      .where(eq(customers.id, customerId))
      .for('update')
    if (!customer || customer.deletedAt) return null
    return { token: await issueLink(tx, customerId, now, demoMode) }
  })
}
