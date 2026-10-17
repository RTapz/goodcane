import { z } from 'zod'

/** POST /api/payments/simulate body. The reference is made by the client for each attempt (BR-P3). */
export const simulatePaymentBody = z.strictObject({
  orderId: z.uuid(),
  reference: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'Invalid payment reference'),
  outcome: z.enum(['success', 'failed', 'no_response'])
})

export interface SimulatePaymentResponse {
  result: 'confirmed' | 'not_confirmed' | 'hold_kept'
  reason: string | null
  refundDue: boolean
  replayed: boolean
  /** Only on the first confirmation for a customer without a link; shown once on C6. */
  privateLink: string | null
  whatsappUrl: string | null
}

export interface NewLinkResponse {
  privateLink: string
  whatsappUrl: string | null
}
