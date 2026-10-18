import { z } from 'zod'

export const loginBody = z.strictObject({
  // A generous upper limit only to refuse silly payloads; the passcode itself is not shaped.
  passcode: z.string().min(1).max(200)
})

export const bufferBody = z.strictObject({
  setting: z.enum(['careful', 'balanced', 'never_sell_out'])
})

export const ordersQuery = z.strictObject({
  drop: z.uuid().optional(),
  status: z.enum(['requested', 'lapsed', 'paid_confirmed', 'fulfilled', 'cancelled', 'expired']).optional()
})

export const cancelBody = z.strictObject({
  // BR-X1: the client sends this only from the confirm dialog.
  confirm: z.literal(true)
})
