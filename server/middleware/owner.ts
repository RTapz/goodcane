// Every owner API route needs the owner session, except logging in (spec 8).
// Without it the answer is a bare 401: no hint about what is missing or why.
// The customer cookie is never looked at here, so it can never grant owner access.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (path !== '/api/owner' && !path.startsWith('/api/owner/')) return
  if (path === '/api/owner/login') return
  if (!(await isOwner(event))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
})
