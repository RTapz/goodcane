// GET /r/:token: opening a reminder link (BR-L5). Like /c/:token, for a reminder token that has
// not expired (it expires at that drop's cut-off). The token is never logged or passed on.
import { landingFor, redeemLink } from '../../services/links'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'Cache-Control', 'no-store')

  const raw = getRouterParam(event, 'token') ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return sendRedirect(event, '/link-invalid', 302)

  const now = new Date()
  const db = useDb()
  const redeemed = await redeemLink(db, raw, now, useRuntimeConfig().public.demoMode, 'reminder')
  if (!redeemed) return sendRedirect(event, '/link-invalid', 302)

  setSessionCookie(event, redeemed.sessionToken)
  return sendRedirect(event, await landingFor(db, redeemed.customerId, now), 302)
})
