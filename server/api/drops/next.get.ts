// GET /api/drops/next: the drop customers can order for now, its spaces left and the menu.
import { and, asc, eq, inArray } from 'drizzle-orm'
import { fitsInDrop, spacesLeft } from '../../domain/capacity'
import { pickNextDrop } from '../../domain/drops'
import { drops, menuItems } from '../../db/schema'
import { nextDropQuery, nextDropResponse } from '../../schemas/drops'
import { dropUsage, type DropUsage } from '../../services/capacity'
import { readSettings } from '../../services/settings'

const MAIN_FLOW_SIZES = ['330ml', '500ml'] as const

export default defineEventHandler(async (event) => {
  await getValidatedQuery(event, (query) => nextDropQuery.parse(query))
  const now = new Date()
  const db = useDb()

  let openDrops, usage: Map<string, DropUsage>, menu, settings
  try {
    openDrops = await db
      .select({ id: drops.id, dropAt: drops.dropAt, cutOffAt: drops.cutOffAt, capacity: drops.capacity })
      .from(drops)
      .where(eq(drops.status, 'open'))
      .orderBy(asc(drops.dropAt))

    usage = await dropUsage(
      db,
      openDrops.map((d) => d.id),
      now
    )

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

    settings = await readSettings(db, ['pickup_window', 'delivery_areas'])
  } catch {
    // No details in the response or the log: they could include connection strings.
    throw createError({ statusCode: 503, statusMessage: 'Drops are not available right now' })
  }

  const withSpaces = (drop: (typeof openDrops)[number] | null) => {
    if (!drop) return null
    const use = usage.get(drop.id) ?? { confirmedUnits: 0, heldUnits: 0 }
    return {
      id: drop.id,
      dropAt: drop.dropAt.toISOString(),
      cutOffAt: drop.cutOffAt.toISOString(),
      capacity: drop.capacity,
      spacesLeft: spacesLeft({ capacity: drop.capacity, ...use })
    }
  }

  const choice = pickNextDrop(openDrops, now)
  const drop = withSpaces(choice.drop)

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
    pickupWindow: settings.pickup_window,
    deliveryAreas: settings.delivery_areas.map(({ id, name, feePesewas }) => ({ id, name, feePesewas }))
  })
})
