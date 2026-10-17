import { z } from 'zod'

const line = z.strictObject({
  menuItemId: z.uuid(),
  quantity: z.number().int().min(1).max(70)
})

const base = {
  dropId: z.uuid(),
  lines: z
    .array(line)
    .min(1, 'Your order is empty')
    .max(30)
    .refine((lines) => new Set(lines.map((l) => l.menuItemId)).size === lines.length, 'Each item can appear only once'),
  firstName: z.string().trim().min(1, 'Enter your first name').max(50, 'Use 50 characters or fewer'),
  phone: z.string().trim().min(1, 'Enter your phone number').max(30),
  idempotencyKey: z.uuid()
}

/** POST /api/orders body. Pickup bodies cannot carry an address (strict objects). */
export const createOrderBody = z.discriminatedUnion('fulfilment', [
  z.strictObject({ ...base, fulfilment: z.literal('pickup') }),
  z.strictObject({
    ...base,
    fulfilment: z.literal('delivery'),
    deliveryAddress: z.string().trim().min(5, 'Enter the delivery address').max(200, 'Use 200 characters or fewer'),
    deliveryAreaId: z.string().min(1, 'Choose a delivery area')
  })
])

export type CreateOrderBody = z.infer<typeof createOrderBody>

/**
 * POST /api/orders reorder body (C7). No name, phone or address: the server copies them from the
 * session's customer. No prices either: lines are strict, so unitPricePesewas or totalPesewas is
 * rejected. expectedTotalPesewas is a guard only, compared with the server's own total.
 */
const reorderBase = {
  reorder: z.literal(true),
  dropId: base.dropId,
  lines: base.lines,
  idempotencyKey: base.idempotencyKey,
  expectedTotalPesewas: z.number().int().nonnegative()
}

export const reorderBody = z.discriminatedUnion('fulfilment', [
  z.strictObject({ ...reorderBase, fulfilment: z.literal('pickup') }),
  z.strictObject({ ...reorderBase, fulfilment: z.literal('delivery'), deliveryAreaId: z.string().min(1) })
])

export type ReorderBody = z.infer<typeof reorderBody>

/** Field name to messages, for inline errors on C3. */
export type FieldErrors = Partial<Record<'firstName' | 'phone' | 'deliveryAddress' | 'deliveryAreaId' | 'lines', string[]>>
