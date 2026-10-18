// Data model from spec section 7.
// Conventions: snake_case names, uuid keys, money as integer pesewas,
// times as timestamptz (UTC instants), is_sample on every table so the seed can reset sample rows.
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

// Enums

export const dropStatus = pgEnum('drop_status', ['open', 'closed', 'completed'])
export const orderStatus = pgEnum('order_status', [
  'requested',
  'paid_confirmed',
  'fulfilled',
  'cancelled',
  'expired'
])
export const fulfilment = pgEnum('fulfilment', ['pickup', 'delivery'])
export const tokenKind = pgEnum('token_kind', ['link', 'session', 'reminder'])
export const consentAction = pgEnum('consent_action', ['opt_in', 'opt_out'])
export const reminderChannel = pgEnum('reminder_channel', ['whatsapp', 'sms', 'none'])
export const reminderFrequency = pgEnum('reminder_frequency', [
  'every_drop',
  'every_second_drop',
  'monthly'
])
export const reminderStatus = pgEnum('reminder_status', ['queued', 'sent'])
export const paymentOutcome = pgEnum('payment_outcome', ['success', 'failed', 'no_response'])
// What processing a payment did (BR-P3 "returns the stored result").
export const paymentResult = pgEnum('payment_result', ['confirmed', 'not_confirmed', 'hold_kept'])
export const tasteGroup = pgEnum('taste_group', ['sweet', 'spicy', 'sour'])
export const itemSize = pgEnum('item_size', ['330ml', '500ml', '2l', '4l'])
export const orderActor = pgEnum('order_actor', ['customer', 'owner', 'system'])
export const forecastMethod = pgEnum('forecast_method', ['baseline', 'pace'])

// Shared column helpers

const id = () => uuid('id').primaryKey().defaultRandom()
const isSample = () => boolean('is_sample').notNull().default(false)
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => timestamptz('created_at').notNull().defaultNow()

// Tables
// Every table has row level security on and no policies: the app connects only from the server as
// the table owner (which bypasses RLS), so the Supabase Data API with an anon key can read nothing.

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  isSample: isSample()
}).enableRLS()

export const drops = pgTable(
  'drops',
  {
    id: id(),
    dropAt: timestamptz('drop_at').notNull().unique(),
    cutOffAt: timestamptz('cut_off_at').notNull(),
    capacity: integer('capacity').notNull(),
    status: dropStatus('status').notNull().default('open'),
    // Filled in by Close batch (spec 5.10).
    unitsMade: integer('units_made'),
    unplannedSold: integer('unplanned_sold'),
    unitsWasted: integer('units_wasted'),
    closedAt: timestamptz('closed_at'),
    isSample: isSample()
  },
  (t) => [
    check('drops_capacity_non_negative', sql`${t.capacity} >= 0`),
    check('drops_cut_off_before_drop', sql`${t.cutOffAt} <= ${t.dropAt}`)
  ]
).enableRLS()

export const menuItems = pgTable(
  'menu_items',
  {
    id: id(),
    name: text('name').notNull(),
    tasteGroup: tasteGroup('taste_group').notNull(),
    size: itemSize('size').notNull(),
    pricePesewas: integer('price_pesewas').notNull(),
    capacityWeight: integer('capacity_weight').notNull(),
    isSpecial: boolean('is_special').notNull().default(false),
    active: boolean('active').notNull().default(true),
    isSample: isSample()
  },
  (t) => [
    check('menu_items_price_non_negative', sql`${t.pricePesewas} >= 0`),
    check('menu_items_weight_positive', sql`${t.capacityWeight} > 0`)
  ]
).enableRLS()

export const customers = pgTable(
  'customers',
  {
    id: id(),
    // Nullable: wiped by the retention purge (BR-DP1).
    firstName: text('first_name'),
    // Indexed but not unique. Never used to look a customer up at order time (BR-L7).
    phone: text('phone'),
    // Nullable: nothing is preselected (BR-R1).
    reminderChannel: reminderChannel('reminder_channel'),
    reminderFrequency: reminderFrequency('reminder_frequency'),
    lastActiveAt: timestamptz('last_active_at').notNull().defaultNow(),
    deletedAt: timestamptz('deleted_at'),
    isSample: isSample()
  },
  (t) => [index('customers_phone_idx').on(t.phone)]
).enableRLS()

export const accessTokens = pgTable(
  'access_tokens',
  {
    id: id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    kind: tokenKind('kind').notNull(),
    // SHA-256 of the raw token. The raw value is never stored (BR-L2).
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at'),
    revokedAt: timestamptz('revoked_at'),
    dropId: uuid('drop_id').references(() => drops.id, { onDelete: 'cascade' }),
    isSample: isSample()
  },
  (t) => [index('access_tokens_customer_idx').on(t.customerId)]
).enableRLS()

// Append-only (BR-R2).
export const consentEvents = pgTable(
  'consent_events',
  {
    id: id(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    action: consentAction('action').notNull(),
    channel: reminderChannel('channel'),
    frequency: reminderFrequency('frequency'),
    source: text('source').notNull(),
    createdAt: createdAt(),
    isSample: isSample()
  },
  (t) => [index('consent_events_customer_idx').on(t.customerId)]
).enableRLS()

export const orders = pgTable(
  'orders',
  {
    id: id(),
    // Set to null when the customer is purged, so anonymised orders keep the metrics (BR-DP1).
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id),
    status: orderStatus('status').notNull().default('requested'),
    fulfilment: fulfilment('fulfilment').notNull(),
    // Delivery only (BR-O6).
    address: text('address'),
    area: text('area'),
    feePesewas: integer('fee_pesewas').notNull().default(0),
    totalPesewas: integer('total_pesewas').notNull(),
    holdExpiresAt: timestamptz('hold_expires_at'),
    createdAt: createdAt(),
    paidAt: timestamptz('paid_at'),
    refundDue: boolean('refund_due').notNull().default(false),
    // Client-generated per submission, so a double tap returns the same order (BR-O9).
    idempotencyKey: text('idempotency_key').unique(),
    isSample: isSample()
  },
  (t) => [
    index('orders_drop_status_idx').on(t.dropId, t.status),
    index('orders_customer_idx').on(t.customerId),
    check('orders_fee_non_negative', sql`${t.feePesewas} >= 0`),
    check('orders_total_non_negative', sql`${t.totalPesewas} >= 0`)
  ]
).enableRLS()

export const orderItems = pgTable(
  'order_items',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    quantity: integer('quantity').notNull(),
    // Price at the time of ordering, so later price changes do not rewrite history.
    unitPricePesewas: integer('unit_price_pesewas').notNull(),
    isSample: isSample()
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.menuItemId] }),
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
    check('order_items_price_non_negative', sql`${t.unitPricePesewas} >= 0`)
  ]
).enableRLS()

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Unique so each payment reference is processed once (BR-P3).
    reference: text('reference').notNull().unique(),
    outcome: paymentOutcome('outcome').notNull(),
    result: paymentResult('result').notNull(),
    // Why a success was not confirmed, e.g. not_enough_space or drop_closed.
    reason: text('reason'),
    // A success that could not be confirmed would be refunded in a live service (BR-O2).
    refundDue: boolean('refund_due').notNull().default(false),
    createdAt: createdAt(),
    isSample: isSample()
  },
  (t) => [index('payments_order_idx').on(t.orderId)]
).enableRLS()

export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    channel: reminderChannel('channel').notNull(),
    status: reminderStatus('status').notNull().default('queued'),
    sentAt: timestamptz('sent_at'),
    isSample: isSample()
  },
  // One chase maximum: at most one reminder per customer per drop (BR-R5).
  (t) => [unique('reminders_customer_drop_unique').on(t.customerId, t.dropId)]
).enableRLS()

export const turnedAway = pgTable(
  'turned_away',
  {
    id: id(),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    // One row per order at most (BR-F2), so retries do not inflate demand.
    orderId: uuid('order_id')
      .unique()
      .references(() => orders.id, { onDelete: 'set null' }),
    units: integer('units').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
    isSample: isSample()
  },
  (t) => [check('turned_away_units_positive', sql`${t.units} > 0`)]
).enableRLS()

export const orderHistory = pgTable(
  'order_history',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Null for the first state an order enters.
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    actor: orderActor('actor').notNull(),
    createdAt: createdAt(),
    isSample: isSample()
  },
  (t) => [index('order_history_order_idx').on(t.orderId)]
).enableRLS()

export const forecastSnapshots = pgTable(
  'forecast_snapshots',
  {
    id: id(),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drops.id, { onDelete: 'cascade' }),
    checkpointAt: timestamptz('checkpoint_at').notNull(),
    method: forecastMethod('method').notNull(),
    projectedUnits: integer('projected_units').notNull(),
    isSample: isSample()
  },
  (t) => [unique('forecast_snapshots_drop_method_unique').on(t.dropId, t.method)]
).enableRLS()

// Demo owner gate (spec 8). Not sample data, so no is_sample: a reseed must not log the owner out.
export const ownerSessions = pgTable('owner_sessions', {
  id: id(),
  // SHA-256 of the raw cookie token, never the raw value.
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamptz('expires_at').notNull(),
  revokedAt: timestamptz('revoked_at'),
  createdAt: createdAt()
}).enableRLS()

// Failed owner logins, for the 5 per 15 minutes limit. Only a hash of the IP and the time.
// Rows older than 24 hours are pruned on each login attempt.
export const ownerLoginAttempts = pgTable(
  'owner_login_attempts',
  {
    id: id(),
    ipHash: text('ip_hash').notNull(),
    createdAt: createdAt()
  },
  (t) => [index('owner_login_attempts_ip_time_idx').on(t.ipHash, t.createdAt)]
).enableRLS()
