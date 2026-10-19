// Deleting a customer's personal data (BR-DP1, BR-DP2). Pure: it says what changes, and
// server/services/retention.ts applies it in one transaction. "Delete my data now" on C9 and,
// later, `pnpm retention` (BR-DP3) both use it.

export interface PurgeChanges {
  /** The customer row stays, so orders and consent proof keep a valid reference, but holds nothing personal. */
  customer: {
    firstName: null
    phone: null
    reminderChannel: null
    reminderFrequency: null
    deletedAt: Date
  }
  /** The customer's orders are kept for the metrics, without a link to the customer or an address. */
  orders: { customerId: null; address: null }
  /** Private links, sessions and reminder links: none may work again. */
  deleteTokens: true
  /** Reminders not yet sent; sent ones are kept as the record of what was sent. */
  deleteQueuedReminders: true
}

/** Idempotent: a customer already deleted keeps the first deletion time. */
export function purgeCustomer(customer: { deletedAt: Date | null }, now: Date): PurgeChanges {
  return {
    customer: {
      firstName: null,
      phone: null,
      reminderChannel: null,
      reminderFrequency: null,
      deletedAt: customer.deletedAt ?? now
    },
    orders: { customerId: null, address: null },
    deleteTokens: true,
    deleteQueuedReminders: true
  }
}
