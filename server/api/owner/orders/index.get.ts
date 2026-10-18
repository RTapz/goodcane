// GET /api/owner/orders?drop=&status=: O2 list, newest first (lapsed requests shown as lapsed).
import { ordersQuery } from '../../../schemas/owner'
import { listOwnerOrders } from '../../../services/owner/orders'

export default defineEventHandler(async (event) => {
  const query = ordersQuery.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'invalid_filter' })
  const orders = await listOwnerOrders(useDb(), { dropId: query.data.drop, status: query.data.status }, new Date())
  return { orders }
})
