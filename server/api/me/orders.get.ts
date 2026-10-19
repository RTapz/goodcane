// GET /api/me/orders: C9 order history for this browser's customer only (BR-L7). 404 without a session.
import { myOrders } from '../../services/my-orders'

export default defineEventHandler(async (event) => {
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { orders: await myOrders(useDb(), customerId, now) }
})
