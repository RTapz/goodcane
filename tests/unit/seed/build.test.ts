import { describe, expect, it } from 'vitest'
import {
  buildSampleData,
  CAPPED_DROP_CAPACITY,
  SAMPLE_CUSTOMER_COUNT,
  SEED,
  type SampleData
} from '../../../server/db/seed/build'
import { createRand, randInt, type Rand } from '../../../server/db/seed/random'
import { DEMO_CUSTOMER_NAME, DEMO_CUSTOMER_TOKEN } from '../../../server/domain/identity/demo-customer'
import { hashToken } from '../../../server/services/tokens'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-15T09:00:00Z')

// A plain uniform stand-in for pickDay, so the invariants are also checked
// with a day picker that has a different shape from the real one.
const uniformDay = (rand: Rand) => randInt(rand, 0, 5)

function build(pickDay?: (rand: Rand) => number): SampleData {
  return buildSampleData({ rand: createRand(SEED), now, pickDay })
}

function unitsByOrder(data: SampleData): Map<string, number> {
  const weights = new Map(data.menuItems.map((m) => [m.id, m.capacityWeight]))
  const units = new Map<string, number>()
  for (const line of data.orderItems) {
    units.set(line.orderId, (units.get(line.orderId) ?? 0) + line.quantity * (weights.get(line.menuItemId) ?? 0))
  }
  return units
}

describe.each([
  ['the real pickDay', undefined],
  ['a uniform day picker', uniformDay]
])('buildSampleData with %s', (_name, pickDay) => {
  const data = build(pickDay)
  const units = unitsByOrder(data)
  const completed = data.drops.filter((d) => d.status === 'completed')
  const open = data.drops.filter((d) => d.status === 'open')

  it('gives identical data for the same seed and now', () => {
    expect(build(pickDay)).toEqual(data)
  })

  it('creates 8 completed drops and 2 open ones, all dated relative to now', () => {
    expect(completed).toHaveLength(8)
    expect(open).toHaveLength(2)
    const [live, further] = open
    expect(live?.cutOffAt.getTime()).toBe(now.getTime() + 3 * DAY)
    expect(live?.dropAt.getTime()).toBe(now.getTime() + 6 * DAY)
    expect(further?.dropAt.getTime()).toBe(now.getTime() + 10 * DAY)
    for (const drop of completed) {
      expect(drop.dropAt.getTime()).toBeLessThan(now.getTime())
    }
    const gaps = completed.slice(1).map((d, i) => (d.dropAt.getTime() - (completed[i]?.dropAt.getTime() ?? 0)) / DAY)
    // Oldest first; stepping back from the newest drop goes 3 days, then 4, alternately.
    expect(gaps).toEqual([3, 4, 3, 4, 3, 4, 3])
  })

  it('makes the 24-item sample menu', () => {
    expect(data.menuItems).toHaveLength(24)
    expect(data.menuItems.filter((m) => m.size === '4l').map((m) => m.name)).toEqual([
      'Raw cane',
      'Passionfruit cane',
      'Ginger-lemon cane',
      'Lemon-mint cane'
    ])
  })

  it('creates 40 customers with unique fake phones, about 40% ordering on several drops', () => {
    expect(data.customers).toHaveLength(SAMPLE_CUSTOMER_COUNT)
    expect(new Set(data.customers.map((c) => c.phone)).size).toBe(SAMPLE_CUSTOMER_COUNT)
    const paidDrops = new Map<string, Set<string>>()
    for (const o of data.orders) {
      if (o.paidAt && o.customerId) {
        const set = paidDrops.get(o.customerId) ?? new Set<string>()
        set.add(o.dropId)
        paidDrops.set(o.customerId, set)
      }
    }
    const several = [...paidDrops.values()].filter((s) => s.size > 1).length
    expect(several / SAMPLE_CUSTOMER_COUNT).toBeGreaterThanOrEqual(0.35)
    expect(several / SAMPLE_CUSTOMER_COUNT).toBeLessThanOrEqual(0.45)
  })

  it('never lets fulfilled units exceed capacity, and the capped drop is exactly full with turned-away rows', () => {
    for (const drop of completed) {
      const sold = data.orders
        .filter((o) => o.dropId === drop.id && o.status === 'fulfilled')
        .reduce((sum, o) => sum + (units.get(o.id) ?? 0), 0)
      expect(sold).toBeLessThanOrEqual(drop.capacity)
      expect(drop.unitsMade).toBe(sold + (drop.unplannedSold ?? 0) + (drop.unitsWasted ?? 0))
    }
    const capped = completed.filter((d) => d.capacity === CAPPED_DROP_CAPACITY)
    expect(capped).toHaveLength(1)
    const cappedSold = data.orders
      .filter((o) => o.dropId === capped[0]?.id && o.status === 'fulfilled')
      .reduce((sum, o) => sum + (units.get(o.id) ?? 0), 0)
    expect(cappedSold).toBe(CAPPED_DROP_CAPACITY)
    const turnedAway = data.turnedAway.filter((t) => t.dropId === capped[0]?.id)
    expect(turnedAway.length).toBeGreaterThanOrEqual(2)
    expect(data.turnedAway.every((t) => t.dropId === capped[0]?.id)).toBe(true)
  })

  it('places every past-drop payment inside a pickDay bucket, and nothing in the future', () => {
    const cutOffs = new Map(data.drops.map((d) => [d.id, d.cutOffAt.getTime()]))
    for (const o of data.orders) {
      if (!o.paidAt) continue
      expect(o.paidAt.getTime()).toBeLessThan(now.getTime())
      const daysBefore = ((cutOffs.get(o.dropId) ?? 0) - o.paidAt.getTime()) / DAY
      const drop = data.drops.find((d) => d.id === o.dropId)
      if (drop?.status === 'completed') {
        expect(daysBefore).toBeGreaterThan(0)
        expect(daysBefore).toBeLessThanOrEqual(6)
      }
    }
  })

  it('gives the live drop about 30 paid units and about 10 requested units', () => {
    const live = open[0]
    const liveOrders = data.orders.filter((o) => o.dropId === live?.id)
    const paid = liveOrders.filter((o) => o.status === 'paid_confirmed').reduce((s, o) => s + (units.get(o.id) ?? 0), 0)
    const requested = liveOrders.filter((o) => o.status === 'requested').reduce((s, o) => s + (units.get(o.id) ?? 0), 0)
    expect(paid).toBeGreaterThanOrEqual(28)
    expect(paid).toBeLessThanOrEqual(36)
    expect(requested).toBeGreaterThanOrEqual(9)
    expect(requested).toBeLessThanOrEqual(16)
    for (const o of liveOrders.filter((o) => o.status === 'requested')) {
      expect(now.getTime() - (o.createdAt?.getTime() ?? 0)).toBeLessThan(2 * DAY)
    }
    const further = data.orders.filter((o) => o.dropId === open[1]?.id)
    expect(further.length).toBeGreaterThan(0)
    expect(further.every((o) => o.status === 'paid_confirmed')).toBe(true)
  })

  it('records a full history chain that ends in each order status', () => {
    const chains = new Map<string, string[]>()
    for (const h of data.orderHistory) {
      chains.set(h.orderId, [...(chains.get(h.orderId) ?? []), `${h.fromStatus ?? 'none'}>${h.toStatus}`])
    }
    const expected: Record<string, string[]> = {
      fulfilled: ['none>requested', 'requested>paid_confirmed', 'paid_confirmed>fulfilled'],
      cancelled: ['none>requested', 'requested>paid_confirmed', 'paid_confirmed>cancelled'],
      paid_confirmed: ['none>requested', 'requested>paid_confirmed'],
      requested: ['none>requested'],
      expired: ['none>requested', 'requested>expired']
    }
    for (const o of data.orders) {
      expect(chains.get(o.id)).toEqual(expected[o.status ?? 'requested'])
    }
  })

  it('has realistic statuses: some cancellations (all refund due) and some expired requests', () => {
    const paidPast = data.orders.filter((o) => o.status === 'fulfilled' || o.status === 'cancelled')
    const cancelled = data.orders.filter((o) => o.status === 'cancelled')
    expect(cancelled.length).toBeGreaterThan(0)
    expect(cancelled.length / paidPast.length).toBeLessThan(0.12)
    expect(cancelled.every((o) => o.refundDue)).toBe(true)
    expect(data.orders.filter((o) => o.status === 'expired').length).toBeGreaterThan(0)
  })

  it('gives every paid order one successful payment with a unique reference', () => {
    const refs = data.payments.map((p) => p.reference)
    expect(new Set(refs).size).toBe(refs.length)
    for (const o of data.orders.filter((o) => o.paidAt)) {
      expect(data.payments.filter((p) => p.orderId === o.id && p.outcome === 'success')).toHaveLength(1)
    }
  })

  it('keeps reminders to one per customer per drop, only for opted-in customers', () => {
    const pairs = data.reminders.map((r) => `${r.customerId}:${r.dropId}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(data.reminders.some((r) => r.status === 'sent')).toBe(true)
    expect(data.reminders.some((r) => r.status === 'queued')).toBe(true)
    const optedIn = new Set(data.customers.filter((c) => c.reminderChannel).map((c) => c.id))
    expect(data.reminders.every((r) => optedIn.has(r.customerId))).toBe(true)
  })

  it('matches customer reminder settings to their latest consent event', () => {
    for (const c of data.customers) {
      const events = data.consentEvents
        .filter((e) => e.customerId === c.id)
        .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      const latest = events.at(-1)
      if (!latest || latest.action === 'opt_out') {
        // None sets the channel to none (BR-R1); Stop clears it.
        expect(c.reminderChannel).toBe(latest?.channel === 'none' ? 'none' : null)
      } else {
        expect(c.reminderChannel).toBe(latest.channel)
        expect(c.reminderFrequency).toBe(latest.frequency)
      }
    }
    // Two "Stop reminders" and one None.
    expect(data.consentEvents.filter((e) => e.action === 'opt_out' && e.channel === null)).toHaveLength(2)
    expect(data.consentEvents.filter((e) => e.action === 'opt_out' && e.channel === 'none')).toHaveLength(1)
  })

  it('includes examples the reminder query must leave out: a None customer and a deleted one (BR-R7)', () => {
    const none = data.customers.filter((c) => c.reminderChannel === 'none')
    expect(none).toHaveLength(1)
    const deleted = data.customers.filter((c) => c.deletedAt)
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toMatchObject({ firstName: null, phone: null, reminderChannel: null })
    // A deleted customer's orders are kept, anonymised (BR-DP2), and nothing points at them.
    expect(data.orders.some((o) => o.customerId === deleted[0]!.id)).toBe(false)
    expect(data.reminders.some((r) => r.customerId === deleted[0]!.id || r.customerId === none[0]!.id)).toBe(false)
  })
})

describe('Demo Customer A (BR-L4 exception, demo mode only)', () => {
  const withDemo = buildSampleData({ rand: createRand(SEED), now, demoCustomer: true })
  const plain = build()
  const demo = withDemo.customers.find((c) => c.firstName === DEMO_CUSTOMER_NAME)!

  it('is not created without demo mode', () => {
    expect(plain.customers.some((c) => c.firstName === DEMO_CUSTOMER_NAME)).toBe(false)
    expect(plain.accessTokens).toEqual([])
    expect(plain.customers).toHaveLength(SAMPLE_CUSTOMER_COUNT)
  })

  it('is a sample customer with a fake phone, opted in to WhatsApp reminders every drop', () => {
    expect(demo).toMatchObject({ phone: '0000000099', isSample: true, reminderChannel: 'whatsapp', reminderFrequency: 'every_drop' })
    expect(withDemo.consentEvents.filter((e) => e.customerId === demo.id)).toMatchObject([
      { action: 'opt_in', channel: 'whatsapp', frequency: 'every_drop', isSample: true }
    ])
    expect(withDemo.customers).toHaveLength(SAMPLE_CUSTOMER_COUNT + 1)
  })

  it('has a fulfilled usual order of 2 bottles on a completed drop that did not sell out, and nothing on the open drops', () => {
    const own = withDemo.orders.filter((o) => o.customerId === demo.id)
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ status: 'fulfilled', isSample: true })
    const drop = withDemo.drops.find((d) => d.id === own[0]!.dropId)!
    expect(drop).toMatchObject({ status: 'completed', capacity: 70 })
    expect(withDemo.orderItems.filter((l) => l.orderId === own[0]!.id)).toMatchObject([{ quantity: 2 }])
    expect(withDemo.payments.filter((p) => p.orderId === own[0]!.id && p.outcome === 'success')).toHaveLength(1)
  })

  it('keeps the close batch identity on that drop: made = sold + unplanned + wasted', () => {
    const units = unitsByOrder(withDemo)
    const own = withDemo.orders.find((o) => o.customerId === demo.id)!
    const drop = withDemo.drops.find((d) => d.id === own.dropId)!
    const sold = withDemo.orders
      .filter((o) => o.dropId === drop.id && o.status === 'fulfilled')
      .reduce((sum, o) => sum + (units.get(o.id) ?? 0), 0)
    expect(drop.unitsMade).toBe(sold + (drop.unplannedSold ?? 0) + (drop.unitsWasted ?? 0))
  })

  it('has one sample private link, stored as the hash of the fixed published token', () => {
    expect(withDemo.accessTokens).toEqual([
      expect.objectContaining({ customerId: demo.id, kind: 'link', tokenHash: hashToken(DEMO_CUSTOMER_TOKEN), expiresAt: null, isSample: true })
    ])
    expect(DEMO_CUSTOMER_TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('buildSampleData guards', () => {
  it('rejects a pickDay that returns something other than 0 to 5', () => {
    expect(() => build(() => 6)).toThrow(RangeError)
    expect(() => build(() => 2.5)).toThrow(RangeError)
  })
})
