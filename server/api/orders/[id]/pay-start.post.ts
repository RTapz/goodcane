// POST /api/orders/:id/pay-start: hold spaces for this order (BR-O1). Also "Refresh availability".
import { z } from 'zod'
import { payStart } from '../../../services/orders/pay-start'

const notFound = () => createError({ statusCode: 404, statusMessage: 'Order not found' })

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw notFound()
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw notFound()

  const result = await payStart(useDb(), id.data, { now, customerId, demoMode: useRuntimeConfig().public.demoMode })
  switch (result.kind) {
    case 'not_found':
      throw notFound()
    case 'held':
      return { holdExpiresAt: result.holdExpiresAt.toISOString(), existing: result.existing, serverNow: now.toISOString() }
    case 'rejected':
      throw createError({ statusCode: 409, statusMessage: result.reason, data: result })
  }
})
