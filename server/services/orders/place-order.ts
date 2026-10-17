// Places a requested order (BR-O9) in ONE transaction: customer, order, items, history,
// retiring older requests (BR-O8) and the new session token all commit together or not at all.
// No hold is created here: holds come from pay-start in the C5 slice.
import { and, eq, inArray } from 'drizzle-orm'
import { spacesLeft } from '../../domain/capacity/spaces'
import { priceOrder, type Fulfilment } from '../../domain/orders/pricing'
import { checkOrderAllowed, ordersToRetire } from '../../domain/orders/requests'
import type { Db, Tx } from '../../db/client'
import { accessTokens, customers, drops, menuItems, orderHistory, orderItems, orders } from '../../db/schema'
import { dropUsage } from '../capacity'
import { readSettings } from '../settings'
import { generateToken, hashToken, SESSION_DAYS } from '../tokens'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface PlaceOrderInput {
  dropId: string
  lines: { menuItemId: string; quantity: number }[]
  firstName: string
  /** Already normalised to +233XXXXXXXXX. */
  phone: string
  fulfilment: { kind: 'pickup' } | { kind: 'delivery'; areaId: string; address: string }
  idempotencyKey: string
  /**
   * C7 reorder guard only: the total the customer saw. Never stored and never used as a price;
   * if the server-computed total differs, the order is refused with price_changed.
   */
  expectedTotalPesewas?: number
}

export interface PlaceOrderContext {
  /** Server time. Never the browser's. */
  now: Date
  /** The customer behind a valid session cookie, or null. */
  sessionCustomerId: string | null
  /** In DEMO_MODE every row created is flagged is_sample. */
  demoMode: boolean
}

export type PlaceOrderResult =
  | { kind: 'created'; orderId: string; customerId: string; newSessionToken: string | null }
  | { kind: 'existing'; orderId: string }
  | { kind: 'rejected'; reason: 'drop_closed' }
  | { kind: 'rejected'; reason: 'not_enough_space'; spacesLeft: number }
  | { kind: 'rejected'; reason: 'idempotency_conflict' }
  | { kind: 'rejected'; reason: 'price_changed'; totalPesewas: number }
  | { kind: 'invalid'; reason: 'unknown_drop' | 'invalid_item' | 'unknown_area' }

/** Thrown inside the transaction to roll it back and hand a result to the caller. */
class Outcome extends Error {
  constructor(readonly result: PlaceOrderResult) {
    super(result.kind)
  }
}

async function resolveExisting(db: Db | Tx, key: string, sessionCustomerId: string | null) {
  const [existing] = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
  if (!existing) return null
  // Same browser, or a replay before the first response set the cookie: return the id only.
  if (!sessionCustomerId || existing.customerId === sessionCustomerId) {
    return { kind: 'existing', orderId: existing.id } as const
  }
  // Another browser's session with this key: reveal nothing.
  return { kind: 'rejected', reason: 'idempotency_conflict' } as const
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export async function placeOrder(db: Db, input: PlaceOrderInput, ctx: PlaceOrderContext): Promise<PlaceOrderResult> {
  const { now, demoMode } = ctx
  try {
    return await db.transaction(async (tx) => {
      const replay = await resolveExisting(tx, input.idempotencyKey, ctx.sessionCustomerId)
      if (replay) throw new Outcome(replay)

      const [drop] = await tx.select().from(drops).where(eq(drops.id, input.dropId))
      if (!drop) throw new Outcome({ kind: 'invalid', reason: 'unknown_drop' })

      // Prices and weights come from the database, never from the client.
      const ids = input.lines.map((l) => l.menuItemId)
      const items = await tx
        .select({ id: menuItems.id, pricePesewas: menuItems.pricePesewas, capacityWeight: menuItems.capacityWeight })
        .from(menuItems)
        .where(and(inArray(menuItems.id, ids), eq(menuItems.active, true)))
      if (items.length !== new Set(ids).size) throw new Outcome({ kind: 'invalid', reason: 'invalid_item' })

      const priced = input.lines.map((line) => {
        const item = items.find((i) => i.id === line.menuItemId)!
        return { ...line, unitPricePesewas: item.pricePesewas, capacityWeight: item.capacityWeight }
      })
      const { delivery_areas: areas } = await readSettings(tx, ['delivery_areas'])
      const fulfilment: Fulfilment =
        input.fulfilment.kind === 'delivery' ? { kind: 'delivery', areaId: input.fulfilment.areaId } : { kind: 'pickup' }
      let price
      try {
        price = priceOrder(priced, fulfilment, areas)
      } catch {
        throw new Outcome({ kind: 'invalid', reason: 'unknown_area' })
      }

      // Reorder guard: the customer must see the real total before paying it.
      if (input.expectedTotalPesewas !== undefined && input.expectedTotalPesewas !== price.totalPesewas) {
        throw new Outcome({ kind: 'rejected', reason: 'price_changed', totalPesewas: price.totalPesewas })
      }

      // Advisory capacity check: paid units plus active holds. Nothing is reserved (BR-O9).
      const usage = (await dropUsage(tx, [drop.id], now)).get(drop.id) ?? { confirmedUnits: 0, heldUnits: 0 }
      const decision = checkOrderAllowed({
        drop,
        now,
        units: price.units,
        spacesLeft: spacesLeft({ capacity: drop.capacity, ...usage })
      })
      if (!decision.ok) {
        throw new Outcome(
          decision.reason === 'not_enough_space'
            ? { kind: 'rejected', reason: decision.reason, spacesLeft: decision.spacesLeft }
            : { kind: 'rejected', reason: decision.reason }
        )
      }

      // Customer: the session's customer (details updated), otherwise a new one. Never by phone.
      let customerId: string | null = null
      if (ctx.sessionCustomerId) {
        const [updated] = await tx
          .update(customers)
          .set({ firstName: input.firstName, phone: input.phone, lastActiveAt: now })
          .where(eq(customers.id, ctx.sessionCustomerId))
          .returning({ id: customers.id, deletedAt: customers.deletedAt })
        if (updated && !updated.deletedAt) customerId = updated.id
      }
      const isNewCustomer = customerId === null
      if (!customerId) {
        const [created] = await tx
          .insert(customers)
          .values({ firstName: input.firstName, phone: input.phone, lastActiveAt: now, isSample: demoMode })
          .returning({ id: customers.id })
        customerId = created!.id
      }

      // BR-O8: retire this session's older unpaid requests on the same drop.
      if (!isNewCustomer) {
        const candidates = await tx
          .select({
            id: orders.id,
            customerId: orders.customerId,
            dropId: orders.dropId,
            status: orders.status,
            holdExpiresAt: orders.holdExpiresAt
          })
          .from(orders)
          .where(and(eq(orders.customerId, customerId), eq(orders.dropId, drop.id), eq(orders.status, 'requested')))
        const retire = ordersToRetire(candidates, { customerId, dropId: drop.id, now })
        if (retire.length > 0) {
          await tx.update(orders).set({ status: 'expired' }).where(inArray(orders.id, retire))
          await tx.insert(orderHistory).values(
            retire.map((orderId) => ({
              orderId,
              fromStatus: 'requested' as const,
              toStatus: 'expired' as const,
              actor: 'system' as const,
              createdAt: now,
              isSample: demoMode
            }))
          )
        }
      }

      const [order] = await tx
        .insert(orders)
        .values({
          customerId,
          dropId: drop.id,
          status: 'requested',
          fulfilment: input.fulfilment.kind,
          address: input.fulfilment.kind === 'delivery' ? input.fulfilment.address : null,
          area: price.area?.name ?? null,
          feePesewas: price.feePesewas,
          totalPesewas: price.totalPesewas,
          holdExpiresAt: null,
          createdAt: now,
          idempotencyKey: input.idempotencyKey,
          isSample: demoMode
        })
        .returning({ id: orders.id })
      const orderId = order!.id

      await tx.insert(orderItems).values(
        priced.map((p) => ({
          orderId,
          menuItemId: p.menuItemId,
          quantity: p.quantity,
          unitPricePesewas: p.unitPricePesewas,
          isSample: demoMode
        }))
      )
      await tx.insert(orderHistory).values({
        orderId,
        fromStatus: null,
        toStatus: 'requested',
        actor: 'customer',
        createdAt: now,
        isSample: demoMode
      })

      // A browser without a session gets one. Only the hash is stored (BR-L2).
      let newSessionToken: string | null = null
      if (!ctx.sessionCustomerId || isNewCustomer) {
        newSessionToken = generateToken()
        await tx.insert(accessTokens).values({
          customerId,
          kind: 'session',
          tokenHash: hashToken(newSessionToken),
          expiresAt: new Date(now.getTime() + SESSION_DAYS * MS_PER_DAY),
          isSample: demoMode
        })
      }

      return { kind: 'created', orderId, customerId, newSessionToken } as const
    })
  } catch (error) {
    if (error instanceof Outcome) return error.result
    // Two identical submissions raced: the loser rolled back. Return the winner's order.
    if (isUniqueViolation(error)) {
      const replay = await resolveExisting(db, input.idempotencyKey, ctx.sessionCustomerId)
      if (replay) return replay
    }
    throw error
  }
}
