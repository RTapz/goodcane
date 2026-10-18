// GET /api/owner/session: 200 when the owner session is valid (the middleware answers 401 otherwise).
export default defineEventHandler(() => ({ ok: true }))
