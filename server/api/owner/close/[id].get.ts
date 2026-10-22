// GET /api/owner/close/:id: O3, what closing this drop would involve (BR-B1 to B4).
import { z } from 'zod'
import { closeInfo } from '../../../services/owner/close-batch'

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Drop not found' })
  const info = await closeInfo(useDb(), id.data, { now: new Date(), demoMode: useRuntimeConfig().public.demoMode })
  if (!info) throw createError({ statusCode: 404, statusMessage: 'Drop not found' })
  return info
})
