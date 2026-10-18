// POST /api/owner/settings/buffer: Careful with waste, Balanced or Never sell out (BR-FC8).
import { sql } from 'drizzle-orm'
import { settings } from '../../../db/schema'
import { bufferBody } from '../../../schemas/owner'

export default defineEventHandler(async (event) => {
  const body = bufferBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'invalid_setting' })
  await useDb()
    .insert(settings)
    .values({ key: 'buffer_setting', value: body.data.setting, isSample: useRuntimeConfig().public.demoMode })
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded."value"` } })
  return { setting: body.data.setting }
})
