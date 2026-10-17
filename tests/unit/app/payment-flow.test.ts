// Regression tests for the lost private link: C6 trusted a cached "requested" order and bounced
// the customer back to C5, so the link held in memory was never shown.
import { describe, expect, it } from 'vitest'
import { completeSuccessfulPayment, shouldReturnToPay, type StoredLink } from '../../../app/utils/payment-flow'

describe('completeSuccessfulPayment (C5 after a simulated success)', () => {
  it('stores the private link and refreshes the order BEFORE navigating to C6', async () => {
    const steps: string[] = []
    let stored: StoredLink | null = null
    await completeSuccessfulPayment({
      orderId: 'order-1',
      result: { privateLink: 'http://localhost:3000/c/abc', whatsappUrl: null },
      storeLink: (link) => {
        stored = link
        steps.push('store link')
      },
      refreshOrder: async () => {
        steps.push('refresh order')
      },
      navigate: async (path) => {
        steps.push(`navigate ${path}`)
      }
    })
    expect(steps).toEqual(['store link', 'refresh order', 'navigate /confirmed/order-1'])
    expect(stored).toEqual({ orderId: 'order-1', privateLink: 'http://localhost:3000/c/abc', whatsappUrl: null })
  })

  it('keeps the link when navigation is slow (nothing clears it)', async () => {
    let stored: StoredLink | null = null
    await completeSuccessfulPayment({
      orderId: 'order-1',
      result: { privateLink: 'http://localhost:3000/c/abc', whatsappUrl: 'https://wa.me/233200000000?text=x' },
      storeLink: (link) => {
        stored = link
      },
      refreshOrder: async () => {},
      navigate: () => new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(stored).not.toBeNull()
  })

  it('stores nothing when no new link was issued (customer already has one)', async () => {
    let stored: StoredLink | null | undefined
    await completeSuccessfulPayment({
      orderId: 'order-1',
      result: { privateLink: null, whatsappUrl: null },
      storeLink: (link) => {
        stored = link
      },
      refreshOrder: async () => {},
      navigate: async () => {}
    })
    expect(stored).toBeNull()
  })
})

describe('shouldReturnToPay (C6 on open)', () => {
  it('does NOT send a paid customer back to C5 when the cache is stale (the bug)', async () => {
    let status = 'requested' // stale cached copy
    const result = await shouldReturnToPay({
      isPaid: () => status === 'paid_confirmed',
      refresh: async () => {
        status = 'paid_confirmed' // what the server says
      }
    })
    expect(result).toBe(false)
  })

  it('sends the customer back to C5 only when the server confirms the order is unpaid', async () => {
    let refreshed = false
    const result = await shouldReturnToPay({
      isPaid: () => false,
      refresh: async () => {
        refreshed = true
      }
    })
    expect(refreshed).toBe(true)
    expect(result).toBe(true)
  })

  it('does not refetch when the order is already known to be paid', async () => {
    let refreshed = false
    const result = await shouldReturnToPay({
      isPaid: () => true,
      refresh: async () => {
        refreshed = true
      }
    })
    expect(result).toBe(false)
    expect(refreshed).toBe(false)
  })
})
