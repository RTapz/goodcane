// POST /api/owner/customers/:id/link: "Send new link" (BR-L6). Revokes the old link and returns
// the new one once, with a prefilled chat to the demo number only (constraint 3).
import { z } from 'zod'
import { sendNewLink } from '../../../../services/owner/customers'

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  const result = await sendNewLink(useDb(), id.data, new Date(), useRuntimeConfig().public.demoMode)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  setHeader(event, 'Cache-Control', 'no-store')
  return shareLinksFor(result.token)
})
