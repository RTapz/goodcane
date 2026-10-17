// GET /api/me: the returning customer, from the session cookie only (BR-L7). Never by phone.
import { getMe } from '../services/me'

export default defineEventHandler(async (event) => {
  const customerId = await getSessionCustomerId(event)
  const me = customerId ? await getMe(useDb(), customerId) : null
  if (!me) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return me
})
