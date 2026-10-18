// POST /api/owner/logout: revokes the owner session and clears the cookie.
import { revokeOwnerSession } from '../../services/owner/sessions'

export default defineEventHandler(async (event) => {
  const token = getOwnerToken(event)
  if (token) await revokeOwnerSession(useDb(), token, new Date())
  clearOwnerCookie(event)
  return { ok: true }
})
