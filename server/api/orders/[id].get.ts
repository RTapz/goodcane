// GET /api/orders/:id: the C4 summary, only for the session that owns the order (BR-L7).
// Anything else is a plain 404, so the response never reveals whether an order exists.
import { z } from 'zod'
import { getOrderForCustomer } from '../../services/orders/get-order'

const notFound = () => createError({ statusCode: 404, statusMessage: 'Order not found' })

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw notFound()

  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw notFound()

  const summary = await getOrderForCustomer(useDb(), id.data, customerId, now)
  if (!summary) throw notFound()
  return summary
})
