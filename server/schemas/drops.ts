import { z } from 'zod'

const isoDate = z.iso.datetime()

const dropSummary = z.strictObject({
  id: z.string(),
  dropAt: isoDate,
  cutOffAt: isoDate,
  capacity: z.number().int().nonnegative(),
  spacesLeft: z.number().int().nonnegative()
})

export const nextDropQuery = z.strictObject({})

export const nextDropResponse = z.strictObject({
  serverNow: isoDate,
  closed: z.boolean(),
  missedDrop: z.strictObject({ dropAt: isoDate, cutOffAt: isoDate }).nullable(),
  drop: dropSummary.nullable(),
  nextDrop: dropSummary.nullable(),
  menu: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      tasteGroup: z.enum(['sweet', 'spicy', 'sour']),
      size: z.enum(['330ml', '500ml']),
      pricePesewas: z.number().int().nonnegative(),
      capacityWeight: z.number().int().positive(),
      isSpecial: z.boolean(),
      soldOut: z.boolean()
    })
  ),
  pickupWindow: z.strictObject({ start: z.string(), end: z.string() })
})

export type NextDropResponse = z.infer<typeof nextDropResponse>
export type MenuItem = NextDropResponse['menu'][number]
export type DropSummary = NonNullable<NextDropResponse['drop']>
