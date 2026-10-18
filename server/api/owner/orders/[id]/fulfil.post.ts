// POST /api/owner/orders/:id/fulfil: only from paid_confirmed (BR-O3), history actor owner.
import { z } from 'zod'
import { fulfilOrder } from '../../../../services/owner/orders'

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  const result = await fulfilOrder(useDb(), id.data, { now: new Date(), demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  if (result.kind === 'not_allowed') {
    throw createError({ statusCode: 409, statusMessage: 'not_allowed', data: { status: result.status } })
  }
  return { status: result.status, refundDue: result.refundDue }
})
