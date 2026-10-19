// GET /api/owner/customers?q=: O7 list, masked phones only (BR-L8), searched by first name.
import { z } from 'zod'
import { listOwnerCustomers } from '../../../services/owner/customers'

const query = z.strictObject({ q: z.string().max(50).optional() })

export default defineEventHandler(async (event) => {
  const parsed = query.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_search' })
  return { customers: await listOwnerCustomers(useDb(), parsed.data.q ?? '') }
})
