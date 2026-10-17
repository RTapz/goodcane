// Units already used in drops: paid units, and units in holds that have not expired yet.
// A hold stops counting the moment `hold_expires_at` passes (checked on read, BR-C2).
import { eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { menuItems, orderItems, orders } from '../db/schema'

export interface DropUsage {
  confirmedUnits: number
  heldUnits: number
}

export async function dropUsage(db: DbOrTx, dropIds: string[], now: Date): Promise<Map<string, DropUsage>> {
  const usage = new Map<string, DropUsage>()
  if (dropIds.length === 0) return usage

  const units = sql`${orderItems.quantity} * ${menuItems.capacityWeight}`
  const rows = await db
    .select({
      dropId: orders.dropId,
      confirmedUnits: sql<number>`coalesce(sum(case when ${orders.status} in ('paid_confirmed', 'fulfilled') then ${units} else 0 end), 0)::int`,
      heldUnits: sql<number>`coalesce(sum(case when ${orders.status} = 'requested' and ${orders.holdExpiresAt} > ${now.toISOString()}::timestamptz then ${units} else 0 end), 0)::int`
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(inArray(orders.dropId, dropIds))
    .groupBy(orders.dropId)

  for (const row of rows) {
    usage.set(row.dropId, { confirmedUnits: row.confirmedUnits, heldUnits: row.heldUnits })
  }
  return usage
}
