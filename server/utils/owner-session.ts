// The owner cookie `gc_owner` (spec 8): HttpOnly, SameSite=Lax, Secure outside dev.
// Separate from the customer cookie `gc_session`, which never grants owner access.
import type { H3Event } from 'h3'
import { isOwnerSessionValid, OWNER_SESSION_HOURS } from '../services/owner/sessions'

const OWNER_COOKIE = 'gc_owner'

export function setOwnerCookie(event: H3Event, rawToken: string) {
  setCookie(event, OWNER_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: OWNER_SESSION_HOURS * 60 * 60
  })
}

export function clearOwnerCookie(event: H3Event) {
  deleteCookie(event, OWNER_COOKIE, { path: '/' })
}

export function getOwnerToken(event: H3Event): string | null {
  return getCookie(event, OWNER_COOKIE) ?? null
}

export async function isOwner(event: H3Event, now = new Date()): Promise<boolean> {
  const token = getOwnerToken(event)
  return token ? isOwnerSessionValid(useDb(), token, now) : false
}
