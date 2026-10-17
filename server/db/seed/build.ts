// Builds all sample rows for spec section 9 as plain objects. Pure: no database,
// no clock. Same `rand` seed and `now` give exactly the same rows.
import { getCutOff } from '../../domain/drops'
import type {
  consentEvents,
  customers,
  drops,
  menuItems,
  orderHistory,
  orderItems,
  orders,
  payments,
  reminders,
  turnedAway
} from '../schema'
import { settingsDefaults } from '../settings-defaults'
import { flavours, mainFlowSizes, sizes, sizesFor } from './menu'
import { pickDay as defaultPickDay } from './pickDay'
import { chance, pickOne, randBetween, randInt, seededUuid, shuffle, type Rand } from './random'

export const SEED = 20261015
export const SAMPLE_CUSTOMER_COUNT = 40
export const REPEAT_CUSTOMER_COUNT = 16 // about 40% order on several drops
export const COMPLETED_DROP_COUNT = 8
export const DEFAULT_CAPACITY = settingsDefaults.capacity
export const CAPPED_DROP_CAPACITY = 50

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type WithId<T> = T & { id: string }
export type DropRow = WithId<typeof drops.$inferInsert>
export type MenuItemRow = WithId<typeof menuItems.$inferInsert>
export type CustomerRow = WithId<typeof customers.$inferInsert>
export type OrderRow = WithId<typeof orders.$inferInsert>
export type OrderItemRow = typeof orderItems.$inferInsert
export type PaymentRow = WithId<typeof payments.$inferInsert>
export type OrderHistoryRow = WithId<typeof orderHistory.$inferInsert>
export type TurnedAwayRow = WithId<typeof turnedAway.$inferInsert>
export type ConsentEventRow = WithId<typeof consentEvents.$inferInsert>
export type ReminderRow = WithId<typeof reminders.$inferInsert>

export interface SampleData {
  drops: DropRow[]
  menuItems: MenuItemRow[]
  customers: CustomerRow[]
  orders: OrderRow[]
  orderItems: OrderItemRow[]
  payments: PaymentRow[]
  orderHistory: OrderHistoryRow[]
  turnedAway: TurnedAwayRow[]
  consentEvents: ConsentEventRow[]
  reminders: ReminderRow[]
}

export interface BuildOptions {
  rand: Rand
  now: Date
  /** Defaults to the real pickDay. Tests can pass their own. */
  pickDay?: (rand: Rand) => number
}

interface SampleCustomer {
  row: CustomerRow
  usual: MenuItemRow
  lastActiveAt: number
  firstPaidAt: number | null
}

interface DropRef {
  id: string
  dropAt: Date
  cutOffAt: Date
  deliveryShare: number
}

interface Line {
  item: MenuItemRow
  quantity: number
}

type OrderKind = 'fulfilled' | 'cancelled' | 'paid' | 'requested' | 'expired'

interface NewOrder {
  customer: SampleCustomer
  drop: DropRef
  kind: OrderKind
  lines: Line[]
  createdAt: Date
  /** Set for every order that was paid (fulfilled, cancelled, paid). */
  paidAt?: Date
  /** When it was fulfilled, cancelled or expired. */
  endedAt?: Date
}

export function buildSampleData({ rand, now, pickDay = defaultPickDay }: BuildOptions): SampleData {
  const data: SampleData = {
    drops: [],
    menuItems: [],
    customers: [],
    orders: [],
    orderItems: [],
    payments: [],
    orderHistory: [],
    turnedAway: [],
    consentEvents: [],
    reminders: []
  }
  const leadTimeDays = settingsDefaults.lead_time_days
  const newId = () => seededUuid(rand)
  let paymentNumber = 0

  // Menu

  data.menuItems = flavours.flatMap((flavour) =>
    sizesFor(flavour).map((size) => ({
      id: newId(),
      name: flavour.name,
      tasteGroup: flavour.tasteGroup,
      size,
      pricePesewas: sizes[size].pricePesewas,
      capacityWeight: sizes[size].capacityWeight,
      isSpecial: flavour.isSpecial,
      active: true,
      isSample: true
    }))
  )
  const orderable = data.menuItems.filter((item) => mainFlowSizes.includes(item.size))

  // Customers: the first 16 are repeat customers, the rest order once.

  const sampleCustomers: SampleCustomer[] = Array.from({ length: SAMPLE_CUSTOMER_COUNT }, (_, i) => {
    const n = i + 1
    return {
      row: {
        id: newId(),
        firstName: `Sample Customer ${String(n).padStart(2, '0')}`,
        phone: String(n).padStart(10, '0'),
        reminderChannel: null,
        reminderFrequency: null,
        lastActiveAt: now,
        deletedAt: null,
        isSample: true
      },
      usual: pickOne(rand, orderable),
      lastActiveAt: 0,
      firstPaidAt: null
    }
  })
  const repeaters = sampleCustomers.slice(0, REPEAT_CUSTOMER_COUNT)
  const oneOffs = sampleCustomers.slice(REPEAT_CUSTOMER_COUNT)

  // Helpers

  function randomLines(customer: SampleCustomer): Line[] {
    const r = rand()
    const lineCount = r < 0.5 ? 1 : r < 0.9 ? 2 : 3
    const lines: Line[] = []
    for (let i = 0; i < lineCount; i++) {
      const item = i === 0 && chance(rand, 0.7) ? customer.usual : pickOne(rand, orderable)
      const quantity = randInt(rand, 1, 3)
      const existing = lines.find((line) => line.item.id === item.id)
      if (existing) {
        existing.quantity += quantity
      } else {
        lines.push({ item, quantity })
      }
    }
    return lines
  }

  function unitsOf(lines: Line[]): number {
    return lines.reduce((sum, line) => sum + line.quantity * line.item.capacityWeight, 0)
  }

  /** Keeps an order within `room` units by replacing it with the usual item if it would overshoot. */
  function linesWithin(lines: Line[], customer: SampleCustomer, room: number): Line[] {
    return unitsOf(lines) > room ? [{ item: customer.usual, quantity: room }] : lines
  }

  function checkedDay(d: number): number {
    if (!Number.isInteger(d) || d < 0 || d > 5) {
      throw new RangeError(`pickDay must return a whole number from 0 to 5, got ${d}`)
    }
    return d
  }

  /** A random moment inside bucket d: [cut-off - (d+1) days, cut-off - d days). */
  function timeInBucket(cutOffAt: Date, d: number): Date {
    const bucketStart = cutOffAt.getTime() - (d + 1) * DAY
    return new Date(bucketStart + randBetween(rand, 0, DAY))
  }

  function touch(customer: SampleCustomer, at: Date) {
    customer.lastActiveAt = Math.max(customer.lastActiveAt, at.getTime())
  }

  function addHistory(
    orderId: string,
    fromStatus: OrderRow['status'] | null,
    toStatus: NonNullable<OrderRow['status']>,
    actor: 'customer' | 'owner' | 'system',
    createdAt: Date
  ) {
    data.orderHistory.push({ id: newId(), orderId, fromStatus, toStatus, actor, createdAt, isSample: true })
  }

  function addPayment(orderId: string, outcome: 'success' | 'failed', createdAt: Date) {
    paymentNumber += 1
    data.payments.push({
      id: newId(),
      orderId,
      reference: `SAMPLE-PAY-${String(paymentNumber).padStart(5, '0')}`,
      outcome,
      // Seeded successes were all confirmed; seeded failures kept their hold for a retry (BR-P4).
      result: outcome === 'success' ? 'confirmed' : 'hold_kept',
      createdAt,
      isSample: true
    })
  }

  /** Adds an order with its items, payments and full status history. Returns its units. */
  function addOrder(order: NewOrder): number {
    const { customer, drop, kind, lines, createdAt, paidAt, endedAt } = order
    const orderId = newId()

    const delivery = chance(rand, drop.deliveryShare)
    const area = delivery ? pickOne(rand, settingsDefaults.delivery_areas) : null
    const feePesewas = area?.feePesewas ?? 0
    const itemsPesewas = lines.reduce((sum, line) => sum + line.quantity * line.item.pricePesewas, 0)

    const status: NonNullable<OrderRow['status']> =
      kind === 'paid' ? 'paid_confirmed' : kind === 'fulfilled' ? 'fulfilled' : kind

    data.orders.push({
      id: orderId,
      customerId: customer.row.id,
      dropId: drop.id,
      status,
      fulfilment: delivery ? 'delivery' : 'pickup',
      address: delivery ? `Sample address ${randInt(rand, 1, 99)}` : null,
      area: area?.name ?? null,
      feePesewas,
      totalPesewas: itemsPesewas + feePesewas,
      holdExpiresAt: null,
      createdAt,
      paidAt: paidAt ?? null,
      // BR-O4: cancelling a paid order always sets refund_due.
      refundDue: kind === 'cancelled',
      isSample: true
    })
    for (const line of lines) {
      data.orderItems.push({
        orderId,
        menuItemId: line.item.id,
        quantity: line.quantity,
        unitPricePesewas: line.item.pricePesewas,
        isSample: true
      })
    }

    addHistory(orderId, null, 'requested', 'customer', createdAt)
    touch(customer, createdAt)

    if (paidAt) {
      if (chance(rand, 0.1)) {
        addPayment(orderId, 'failed', new Date(paidAt.getTime() - randInt(rand, 1, 5) * MINUTE))
      }
      addPayment(orderId, 'success', paidAt)
      addHistory(orderId, 'requested', 'paid_confirmed', 'system', paidAt)
      if (customer.firstPaidAt === null || paidAt.getTime() < customer.firstPaidAt) {
        customer.firstPaidAt = paidAt.getTime()
      }
    }
    if (kind === 'fulfilled' && endedAt) {
      addHistory(orderId, 'paid_confirmed', 'fulfilled', 'owner', endedAt)
    }
    if (kind === 'cancelled' && endedAt) {
      addHistory(orderId, 'paid_confirmed', 'cancelled', 'customer', endedAt)
    }
    if (kind === 'expired' && endedAt) {
      addHistory(orderId, 'requested', 'expired', 'system', endedAt)
    }
    return unitsOf(lines)
  }

  /** Customers to serve in order, topping up with repeat customers if the list runs out. */
  function customerQueue(first: SampleCustomer[]) {
    let queue = [...first, ...shuffle(rand, repeaters)]
    return () => {
      if (queue.length === 0) {
        queue = shuffle(rand, repeaters)
      }
      return queue.shift() as SampleCustomer
    }
  }

  function addDrop(dropAt: Date, capacity: number, status: 'open' | 'completed'): DropRef {
    const ref: DropRef = {
      id: newId(),
      dropAt,
      cutOffAt: getCutOff(dropAt, leadTimeDays),
      deliveryShare: randBetween(rand, 0.15, 0.35)
    }
    data.drops.push({
      id: ref.id,
      dropAt,
      cutOffAt: ref.cutOffAt,
      capacity,
      status,
      unitsMade: null,
      unplannedSold: null,
      unitsWasted: null,
      closedAt: null,
      isSample: true
    })
    return ref
  }

  // Dates, relative to now. The live drop's cut-off is now + 3 days.

  const liveDropAt = new Date(now.getTime() + (3 + leadTimeDays) * DAY)
  const furtherDropAt = new Date(liveDropAt.getTime() + 4 * DAY)
  // Newest completed drop skips the slot just before the live drop, so it is really in the past.
  const completedDropAts: Date[] = []
  let at = liveDropAt.getTime() - 7 * DAY
  for (let i = 0; i < COMPLETED_DROP_COUNT; i++) {
    completedDropAts.unshift(new Date(at))
    at -= (i % 2 === 0 ? 3 : 4) * DAY
  }

  // Completed drops, oldest first.

  completedDropAts.forEach((dropAt, i) => {
    const isCapped = i === COMPLETED_DROP_COUNT - 1
    const capacity = isCapped ? CAPPED_DROP_CAPACITY : DEFAULT_CAPACITY
    const trend = 38 + (18 * i) / (COMPLETED_DROP_COUNT - 1)
    const demand = isCapped ? randInt(rand, 54, 58) : Math.round(trend + randBetween(rand, -3, 3))
    const drop = addDrop(dropAt, capacity, 'completed')
    const nextCustomer = customerQueue(oneOffs.splice(0, 2))

    let paidUnits = 0
    while (paidUnits < Math.min(demand, capacity)) {
      const customer = nextCustomer()
      let lines = randomLines(customer)
      if (paidUnits + unitsOf(lines) > capacity) {
        // Fill the drop exactly to capacity.
        lines = [{ item: customer.usual, quantity: capacity - paidUnits }]
      }
      const paidAt = timeInBucket(drop.cutOffAt, checkedDay(pickDay(rand)))
      const createdAt = new Date(paidAt.getTime() - randInt(rand, 8, 20) * MINUTE)

      if (chance(rand, 0.06)) {
        const cancelledAt = new Date(randBetween(rand, paidAt.getTime(), drop.cutOffAt.getTime()))
        addOrder({ customer, drop, kind: 'cancelled', lines, createdAt, paidAt, endedAt: cancelledAt })
        continue
      }
      const fulfilledAt = new Date(dropAt.getTime() + randBetween(rand, 0, 6 * HOUR))
      paidUnits += addOrder({ customer, drop, kind: 'fulfilled', lines, createdAt, paidAt, endedAt: fulfilledAt })
    }

    // Requests that were never paid and expired (earlier of 2 days or cut-off).
    const expiredCount = randInt(rand, 3, 5)
    for (let n = 0; n < expiredCount; n++) {
      const customer = pickOne(rand, repeaters)
      const createdAt = new Date(drop.cutOffAt.getTime() - randBetween(rand, 0.5 * DAY, 6 * DAY))
      const expiredAt = new Date(Math.min(createdAt.getTime() + 2 * DAY, drop.cutOffAt.getTime()))
      addOrder({ customer, drop, kind: 'expired', lines: randomLines(customer), createdAt, endedAt: expiredAt })
    }

    if (isCapped) {
      let excess = demand - capacity
      const rows = randInt(rand, 2, 3)
      for (let n = rows; n > 0 && excess > 0; n--) {
        const units = n === 1 ? excess : randInt(rand, 1, Math.max(1, excess - (n - 1)))
        excess -= units
        data.turnedAway.push({
          id: newId(),
          dropId: drop.id,
          units,
          reason: 'drop_full',
          createdAt: new Date(drop.cutOffAt.getTime() - randBetween(rand, 0, DAY)),
          isSample: true
        })
      }
    }

    // Close batch (spec 5.10): made = orders sold + unplanned + wasted.
    const row = data.drops[data.drops.length - 1] as DropRow
    row.unplannedSold = randInt(rand, 8, 16)
    row.unitsWasted = randInt(rand, 0, 3)
    row.unitsMade = paidUnits + row.unplannedSold + row.unitsWasted
    row.closedAt = new Date(dropAt.getTime() + 6 * HOUR)
  })

  // Live drop: about 30 paid units so far and about 10 requested units.

  const live = addDrop(liveDropAt, DEFAULT_CAPACITY, 'open')
  // Only buckets that have already ended can hold payments: d >= 3 here.
  const earliestPastDay = Math.ceil((live.cutOffAt.getTime() - now.getTime()) / DAY)
  function pastDayForLiveDrop(): number {
    for (let tries = 0; tries < 1000; tries++) {
      const d = checkedDay(pickDay(rand))
      if (d >= earliestPastDay) {
        return d
      }
    }
    throw new Error(`pickDay never returned a day of ${earliestPastDay} or more in 1000 tries`)
  }

  const livePaidTarget = randInt(rand, 28, 32)
  const nextLiveCustomer = customerQueue(oneOffs.splice(0, 5))
  const liveCustomers = new Set<string>()
  let livePaidUnits = 0
  for (let tries = 0; livePaidUnits < livePaidTarget && tries < 500; tries++) {
    const customer = nextLiveCustomer()
    if (liveCustomers.has(customer.row.id)) {
      continue
    }
    liveCustomers.add(customer.row.id)
    const lines = linesWithin(randomLines(customer), customer, livePaidTarget - livePaidUnits)
    const paidAt = timeInBucket(live.cutOffAt, pastDayForLiveDrop())
    const createdAt = new Date(paidAt.getTime() - randInt(rand, 8, 20) * MINUTE)
    livePaidUnits += addOrder({ customer, drop: live, kind: 'paid', lines, createdAt, paidAt })
  }

  const liveRequestTarget = randInt(rand, 9, 11)
  let liveRequestedUnits = 0
  for (const customer of shuffle(rand, repeaters)) {
    if (liveRequestedUnits >= liveRequestTarget) {
      break
    }
    if (liveCustomers.has(customer.row.id)) {
      continue
    }
    liveCustomers.add(customer.row.id)
    const lines = linesWithin(randomLines(customer), customer, liveRequestTarget - liveRequestedUnits)
    const createdAt = new Date(now.getTime() - randBetween(rand, 0, 36 * HOUR))
    liveRequestedUnits += addOrder({ customer, drop: live, kind: 'requested', lines, createdAt })
  }

  // Further open drop: a few early paid orders and no requests. Its cut-off is a week away,
  // so no pickDay bucket has started yet; these early payments land in the last 2 days instead.

  const further = addDrop(furtherDropAt, DEFAULT_CAPACITY, 'open')
  for (const customer of oneOffs.splice(0, 3)) {
    const paidAt = new Date(now.getTime() - randBetween(rand, 0, 2 * DAY))
    const createdAt = new Date(paidAt.getTime() - randInt(rand, 8, 20) * MINUTE)
    addOrder({ customer, drop: further, kind: 'paid', lines: randomLines(customer), createdAt, paidAt })
  }

  // Consent: opt-in happens on the confirmation screen (C6) after a first payment.

  const channels = ['whatsapp', 'sms'] as const
  const frequencies = ['every_drop', 'every_second_drop', 'monthly'] as const
  const optedIn: { customer: SampleCustomer; optInAt: Date }[] = []
  const withPayments = sampleCustomers.filter((c) => c.firstPaidAt !== null)
  let optOutsLeft = 2
  shuffle(rand, withPayments)
    .slice(0, 12)
    .forEach((customer) => {
      const firstPaidAt = customer.firstPaidAt as number
      const optInAt = new Date(
        Math.min(firstPaidAt + randBetween(rand, 1 * MINUTE, 30 * MINUTE), now.getTime() - MINUTE)
      )
      const channel = pickOne(rand, channels)
      const frequency = pickOne(rand, frequencies)
      data.consentEvents.push({
        id: newId(),
        customerId: customer.row.id,
        action: 'opt_in',
        channel,
        frequency,
        source: 'c6',
        createdAt: optInAt,
        isSample: true
      })
      touch(customer, optInAt)

      if (optOutsLeft > 0 && optInAt.getTime() < now.getTime() - 2 * DAY) {
        // Two customers later press "Stop reminders".
        optOutsLeft -= 1
        const optOutAt = new Date(
          Math.min(optInAt.getTime() + randBetween(rand, 1 * DAY, 10 * DAY), now.getTime() - HOUR)
        )
        data.consentEvents.push({
          id: newId(),
          customerId: customer.row.id,
          action: 'opt_out',
          channel: null,
          frequency: null,
          source: 'c9',
          createdAt: optOutAt,
          isSample: true
        })
        touch(customer, optOutAt)
        return
      }
      customer.row.reminderChannel = channel
      customer.row.reminderFrequency = frequency
      optedIn.push({ customer, optInAt })
    })

  // Reminders: a few already sent on past drops, a few queued for the live drop.
  // Never more than one per customer per drop (BR-R5).

  const reminderDaysBefore = settingsDefaults.reminder_days_before_cutoff
  const completedRefs = data.drops.filter((d) => d.status === 'completed')
  const sentPairs = new Set<string>()
  for (const { customer, optInAt } of shuffle(rand, optedIn)) {
    if (sentPairs.size >= 4) {
      break
    }
    const eligible = completedRefs.filter(
      (d) => d.cutOffAt.getTime() - reminderDaysBefore * DAY > optInAt.getTime()
    )
    if (eligible.length === 0) {
      continue
    }
    const drop = pickOne(rand, eligible)
    sentPairs.add(`${customer.row.id}:${drop.id}`)
    data.reminders.push({
      id: newId(),
      customerId: customer.row.id,
      dropId: drop.id,
      channel: customer.row.reminderChannel as 'whatsapp' | 'sms',
      status: 'sent',
      sentAt: new Date(drop.cutOffAt.getTime() - reminderDaysBefore * DAY + randBetween(rand, 0, 3 * HOUR)),
      isSample: true
    })
  }

  const queuedFor = optedIn.filter(({ customer }) => !liveCustomers.has(customer.row.id)).slice(0, 3)
  for (const { customer } of queuedFor) {
    data.reminders.push({
      id: newId(),
      customerId: customer.row.id,
      dropId: live.id,
      channel: customer.row.reminderChannel as 'whatsapp' | 'sms',
      status: 'queued',
      sentAt: null,
      isSample: true
    })
  }

  // Customers: only those who placed at least one order.

  data.customers = sampleCustomers
    .filter((c) => c.lastActiveAt > 0)
    .map((c) => ({ ...c.row, lastActiveAt: new Date(c.lastActiveAt) }))

  return data
}
