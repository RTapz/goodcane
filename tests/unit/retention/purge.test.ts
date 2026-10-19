// purgeCustomer (BR-DP1, BR-DP2): what deleting a customer's data changes. Pure.
import { describe, expect, it } from 'vitest'
import { purgeCustomer } from '../../../server/domain/retention'

const now = new Date('2026-10-19T12:00:00Z')

describe('purgeCustomer', () => {
  it('clears name, phone and reminder choice, marks the customer deleted, and anonymises orders', () => {
    expect(purgeCustomer({ deletedAt: null }, now)).toEqual({
      customer: { firstName: null, phone: null, reminderChannel: null, reminderFrequency: null, deletedAt: now },
      orders: { customerId: null, address: null },
      deleteTokens: true,
      deleteQueuedReminders: true
    })
  })

  it('is idempotent: an already deleted customer keeps the first deletion time', () => {
    const first = new Date('2026-10-01T09:00:00Z')
    expect(purgeCustomer({ deletedAt: first }, now).customer.deletedAt).toEqual(first)
  })
})
