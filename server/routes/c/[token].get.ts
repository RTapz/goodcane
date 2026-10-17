// GET /c/:token: opening a private link (BR-L3). Creates a session, then redirects.
// The token is never logged, and the redirect does not pass it on as a referrer.
import { landingFor, redeemLink } from '../../services/links'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'Cache-Control', 'no-store')

  const raw = getRouterParam(event, 'token') ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return sendRedirect(event, '/link-invalid', 302)

  const now = new Date()
  const db = useDb()
  const redeemed = await redeemLink(db, raw, now, useRuntimeConfig().public.demoMode)
  if (!redeemed) return sendRedirect(event, '/link-invalid', 302)

  setSessionCookie(event, redeemed.sessionToken)
  // Returning customers go straight to "Same again?" (C7, BR-L3).
  return sendRedirect(event, await landingFor(db, redeemed.customerId, now), 302)
})
