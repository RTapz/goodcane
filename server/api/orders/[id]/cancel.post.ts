// POST /api/orders/:id/cancel { confirm: true }: the customer cancels their own order before
// cut-off (BR-X1, BR-X3). A paid order gets refund_due (BR-O4). 404 unless the session owns it.
import { z } from 'zod'
import { cancelBody } from '../../../schemas/owner'
import { cancelOrderAsCustomer } from '../../../services/orders/cancel'

const notFound = () => createError({ statusCode: 404, statusMessage: 'Order not found' })

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw notFound()
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw notFound()
  if (!cancelBody.safeParse(await readBody(event).catch(() => null)).success) {
    throw createError({ statusCode: 400, statusMessage: 'confirm_required' })
  }
  const result = await cancelOrderAsCustomer(useDb(), id.data, { now, customerId, demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'not_found') throw notFound()
  if (result.kind === 'not_allowed') {
    throw createError({ statusCode: 409, statusMessage: result.reason, data: { reason: result.reason, status: result.status } })
  }
  return { status: result.status, refundDue: result.refundDue }
})
