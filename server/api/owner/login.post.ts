// POST /api/owner/login: demo passcode gate (spec 8). 5 failed attempts per 15 minutes per IP gives 429.
import { loginBody } from '../../schemas/owner'
import { ownerLogin } from '../../services/owner/sessions'

export default defineEventHandler(async (event) => {
  const body = loginBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Bad request' })

  // The socket address, not X-Forwarded-For, which any client can set. Behind a proxy the
  // deployment must pass the real client address through (deployment checklist).
  const ip = getRequestIP(event) ?? 'unknown'
  const result = await ownerLogin(useDb(), {
    passcode: body.data.passcode,
    expected: useRuntimeConfig().ownerPasscode,
    ip,
    now: new Date()
  })
  if (result.kind === 'throttled') throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  if (result.kind === 'wrong') throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  setOwnerCookie(event, result.token)
  return { ok: true }
})
