// POST /api/owner/orders/:id/cancel { confirm: true }: a paid order gets refund_due (BR-O4).
import { z } from 'zod'
import { cancelBody } from '../../../../schemas/owner'
import { cancelOrderAsOwner } from '../../../../services/owner/orders'

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  const body = cancelBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'confirm_required' })
  const result = await cancelOrderAsOwner(useDb(), id.data, { now: new Date(), demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  if (result.kind === 'not_allowed') {
    throw createError({ statusCode: 409, statusMessage: 'not_allowed', data: { status: result.status } })
  }
  return { status: result.status, refundDue: result.refundDue }
})
