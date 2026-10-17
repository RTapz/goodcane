// POST /api/me/link: a new private link for this browser's customer (BR-L10). Revokes the old one.
import type { NewLinkResponse } from '../../schemas/payments'
import { hasPaidOrder, issueLink } from '../../services/links'

export default defineEventHandler(async (event): Promise<NewLinkResponse> => {
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  const db = useDb()
  if (!customerId || !(await hasPaidOrder(db, customerId))) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const raw = await issueLink(db, customerId, now, useRuntimeConfig().public.demoMode)
  return shareLinksFor(raw)
})
