// GET /api/owner/drop/:id/demand: the O1 numbers for one drop (spec 5.9).
import { z } from 'zod'
import { dropDemand } from '../../../../services/owner/demand'

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Drop not found' })
  const demand = await dropDemand(useDb(), id.data, { now: new Date(), demoMode: useRuntimeConfig().public.demoMode })
  if (!demand) throw createError({ statusCode: 404, statusMessage: 'Drop not found' })
  return demand
})
