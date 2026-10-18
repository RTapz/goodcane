// GET /api/health: is the app up, and does the database answer a trivial query? (spec 8)
// No data, no versions, no gate. A preview deployment without a database answers database: false.
import { sql } from 'drizzle-orm'

const TIMEOUT_MS = 2000

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  let database = false
  try {
    await Promise.race([
      useDb().execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
    ])
    database = true
  } catch {
    // Unreachable, not configured, or too slow: reported as false, never as an error page.
  }
  return { ok: true, database }
})
