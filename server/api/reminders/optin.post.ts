// POST /api/reminders/optin (BR-R1, BR-R2, BR-R8). Session required.
import { optInBody } from '../../schemas/reminders'
import { optIn } from '../../services/reminders'

export default defineEventHandler(async (event) => {
  const body = optInBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'invalid_choice' })
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const result = await optIn(useDb(), customerId, body.data, { now, demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (result.kind === 'refused') {
    throw createError({ statusCode: 409, statusMessage: 'opt_in_refused', data: { reason: 'opt_in_refused', state: result.state } })
  }
  return { state: result.state }
})
