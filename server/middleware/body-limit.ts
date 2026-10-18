// Request bodies on /api/* are capped at 16 KB (spec 8); larger ones get 413 before any route runs.
// The largest real body, a full order, is under 2 KB. Vercel's own ceiling (4.5 MB) is far too
// generous for this app. The raw body is read once here and h3 keeps it for the route's readBody.
export const MAX_BODY_BYTES = 16 * 1024

export default defineEventHandler(async (event) => {
  if (!getRequestURL(event).pathname.startsWith('/api/')) return
  if (event.method === 'GET' || event.method === 'HEAD') return

  const tooLarge = () => createError({ statusCode: 413, statusMessage: 'Payload too large' })
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > MAX_BODY_BYTES) throw tooLarge()
  // A body sent without a length (chunked) is measured as it is read.
  const raw = await readRawBody(event, false)
  if (raw && raw.length > MAX_BODY_BYTES) throw tooLarge()
})
