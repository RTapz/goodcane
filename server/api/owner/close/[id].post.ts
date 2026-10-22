// POST /api/owner/close/:id { unitsMade, unplannedSold, wasted? }: O3 Close batch (BR-B1 to B4).
// Idempotent: a closed batch is never overwritten; a repeat returns the stored numbers.
import { z } from 'zod'
import { closeDrop } from '../../../services/owner/close-batch'

const units = z.number().int().min(0).max(100_000)
const body = z.strictObject({ unitsMade: units, unplannedSold: units, wasted: units.nullable().optional() })

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Drop not found' })
  const parsed = body.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_numbers' })

  const result = await closeDrop(useDb(), id.data, parsed.data, { now: new Date(), demoMode: useRuntimeConfig().public.demoMode })
  if (result.kind === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Drop not found' })
  if (result.kind === 'refused') throw createError({ statusCode: 409, statusMessage: result.reason, data: { reason: result.reason } })
  const { kind, ...numbers } = result
  return { status: kind, warning: null, ...numbers }
})
