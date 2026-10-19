// POST /api/me/delete { confirm: true }: "Delete my data now" (BR-DP2). Session required.
// Purges in one transaction, then clears the cookie: the session and every link stop working.
import { z } from 'zod'
import { applyPurge } from '../../services/retention'

const body = z.strictObject({ confirm: z.literal(true) })

export default defineEventHandler(async (event) => {
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (!body.safeParse(await readBody(event).catch(() => null)).success) {
    throw createError({ statusCode: 400, statusMessage: 'confirm_required' })
  }
  await useDb().transaction((tx) => applyPurge(tx, customerId, now))
  clearSessionCookie(event)
  return { deleted: true }
})
