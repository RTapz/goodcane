// GET /api/owner/drops: drops for the O1 and O2 pickers, newest first, with the default marked.
import { desc } from 'drizzle-orm'
import { drops } from '../../db/schema'

export default defineEventHandler(async () => {
  const now = new Date()
  const rows = await useDb().select().from(drops).orderBy(desc(drops.dropAt))
  // Default: the next open drop still taking orders, else the most recent drop.
  const next = [...rows].reverse().find((d) => d.status === 'open' && d.cutOffAt.getTime() > now.getTime())
  return {
    defaultDropId: next?.id ?? rows[0]?.id ?? null,
    drops: rows.map((d) => ({
      id: d.id,
      dropAt: d.dropAt.toISOString(),
      cutOffAt: d.cutOffAt.toISOString(),
      status: d.status,
      closed: d.cutOffAt.getTime() <= now.getTime(),
      isSample: d.isSample
    }))
  }
})
