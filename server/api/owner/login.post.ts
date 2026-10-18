// POST /api/owner/login: demo passcode gate (spec 8). 5 failed attempts per 15 minutes per IP gives 429.
import { clientIp, VERCEL_CLIENT_IP_HEADER } from '../../domain/owner/client-ip'
import { loginBody } from '../../schemas/owner'
import { ownerLogin } from '../../services/owner/sessions'

export default defineEventHandler(async (event) => {
  const body = loginBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Bad request' })

  // TRUST_PROXY decides whether Vercel's client-address header is used; X-Forwarded-For never is.
  const config = useRuntimeConfig()
  const ip = clientIp({
    trustProxy: config.trustProxy,
    vercelHeader: getRequestHeader(event, VERCEL_CLIENT_IP_HEADER),
    connectionAddress: getRequestIP(event)
  })
  const result = await ownerLogin(useDb(), {
    passcode: body.data.passcode,
    expected: config.ownerPasscode,
    ip,
    now: new Date()
  })
  if (result.kind === 'throttled') throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  if (result.kind === 'wrong') throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  setOwnerCookie(event, result.token)
  return { ok: true }
})
