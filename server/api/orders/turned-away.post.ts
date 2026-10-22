// POST /api/orders/turned-away: BR-F2 for a completely full drop (C2). Records how many bottles
// someone wanted; creates no order, hold, customer or cookie. Under /api/orders, so the same WAF
// rate limit as order creation applies. The session, if any, only links the row for the dedupe.
import { z } from 'zod'
import { recordTurnedAway } from '../../services/orders/turned-away'

const body = z.strictObject({
  dropId: z.uuid(),
  units: z.number().int().min(1).max(24),
  idempotencyKey: z.string().min(8).max(100)
})

export default defineEventHandler(async (event) => {
  const parsed = body.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_request' })
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  const result = await recordTurnedAway(useDb(), { ...parsed.data, customerId }, { now, demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'refused') throw createError({ statusCode: 409, statusMessage: result.reason, data: { reason: result.reason } })
  setResponseStatus(event, result.kind === 'recorded' ? 201 : 200)
  return { recorded: true }
})
