// POST /api/reminders/optout: the None choice, or "Stop reminders" (BR-R1, BR-R8). Session required.
import { optOutBody } from '../../schemas/reminders'
import { optOut } from '../../services/reminders'

export default defineEventHandler(async (event) => {
  const body = optOutBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'invalid_choice' })
  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const result = await optOut(useDb(), customerId, body.data, { now, demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (result.kind === 'refused') {
    throw createError({ statusCode: 409, statusMessage: 'opt_out_refused', data: { reason: 'opt_out_refused', state: result.state } })
  }
  return { state: result.state }
})
