// GET /api/drops/next: the drop customers can order for now, its spaces left and the menu.
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { fitsInDrop, spacesLeft } from '../../domain/capacity'
import { pickNextDrop } from '../../domain/drops'
import { drops, menuItems, orderItems, orders, settings } from '../../db/schema'
import { nextDropQuery, nextDropResponse } from '../../schemas/drops'

const MAIN_FLOW_SIZES = ['330ml', '500ml'] as const

export default defineEventHandler(async (event) => {
  await getValidatedQuery(event, (query) => nextDropQuery.parse(query))
  const now = new Date()
  const db = useDb()

  let openDrops, usage, menu, pickupSetting
  try {
    openDrops = await db
      .select({ id: drops.id, dropAt: drops.dropAt, cutOffAt: drops.cutOffAt, capacity: drops.capacity })
      .from(drops)
      .where(eq(drops.status, 'open'))
      .orderBy(asc(drops.dropAt))

    const ids = openDrops.map((d) => d.id)
    const units = sql`${orderItems.quantity} * ${menuItems.capacityWeight}`
    usage =
      ids.length === 0
        ? []
        : await db
            .select({
              dropId: orders.dropId,
              confirmedUnits: sql<number>`coalesce(sum(case when ${orders.status} in ('paid_confirmed', 'fulfilled') then ${units} else 0 end), 0)::int`,
              heldUnits: sql<number>`coalesce(sum(case when ${orders.status} = 'requested' and ${orders.holdExpiresAt} > ${now.toISOString()}::timestamptz then ${units} else 0 end), 0)::int`
            })
            .from(orders)
            .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
            .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
            .where(inArray(orders.dropId, ids))
            .groupBy(orders.dropId)

    menu = await db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        tasteGroup: menuItems.tasteGroup,
        size: menuItems.size,
        pricePesewas: menuItems.pricePesewas,
        capacityWeight: menuItems.capacityWeight,
        isSpecial: menuItems.isSpecial
      })
      .from(menuItems)
      .where(and(eq(menuItems.active, true), inArray(menuItems.size, [...MAIN_FLOW_SIZES])))
      .orderBy(asc(menuItems.isSpecial), asc(menuItems.name), asc(menuItems.size))

    pickupSetting = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'pickup_window'))
  } catch {
    // No details in the response or the log: they could include connection strings.
    throw createError({ statusCode: 503, statusMessage: 'Drops are not available right now' })
  }

  const withSpaces = (drop: (typeof openDrops)[number] | null) => {
    if (!drop) return null
    const use = usage.find((u) => u.dropId === drop.id)
    return {
      id: drop.id,
      dropAt: drop.dropAt.toISOString(),
      cutOffAt: drop.cutOffAt.toISOString(),
      capacity: drop.capacity,
      spacesLeft: spacesLeft({
        capacity: drop.capacity,
        confirmedUnits: use?.confirmedUnits ?? 0,
        heldUnits: use?.heldUnits ?? 0
      })
    }
  }

  const choice = pickNextDrop(openDrops, now)
  const drop = withSpaces(choice.drop)
  const pickupWindow = (pickupSetting[0]?.value as { start?: string; end?: string } | undefined) ?? {}

  return nextDropResponse.parse({
    serverNow: now.toISOString(),
    closed: choice.closed,
    missedDrop: choice.missedDrop
      ? { dropAt: choice.missedDrop.dropAt.toISOString(), cutOffAt: choice.missedDrop.cutOffAt.toISOString() }
      : null,
    drop,
    nextDrop: withSpaces(choice.nextDrop),
    menu: menu.map((item) => ({
      ...item,
      soldOut: !drop || !fitsInDrop(item.capacityWeight, drop.spacesLeft)
    })),
    pickupWindow: { start: pickupWindow.start ?? '12:00', end: pickupWindow.end ?? '18:00' }
  })
})
