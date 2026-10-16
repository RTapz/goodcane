// API test: builds the app, starts it, and calls GET /api/drops/next against the seeded database.
// Run with `pnpm test:api` after `pnpm seed`.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { fitsInDrop } from '../../server/domain/capacity'
import { nextDropResponse } from '../../server/schemas/drops'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
if (existsSync(`${rootDir}/.env`)) {
  process.loadEnvFile(`${rootDir}/.env`)
}

await setup({ rootDir, server: true, build: true })

const sql = postgres(process.env.DATABASE_URL ?? '', { max: 1 })
afterAll(() => sql.end())

describe('GET /api/drops/next', () => {
  it('returns the next open drop with spaces left that match the database', async () => {
    const body = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const drop = body.drop
    expect(drop).not.toBeNull()
    if (!drop) return
    expect(Date.parse(drop.cutOffAt)).toBeGreaterThan(Date.parse(body.serverNow))

    // Worked out independently: capacity minus paid units minus active holds (BR-C2).
    const [row] = await sql<{ confirmed: number; held: number }[]>`
      select
        coalesce(sum(case when o."status" in ('paid_confirmed', 'fulfilled') then oi."quantity" * m."capacity_weight" else 0 end), 0)::int as "confirmed",
        coalesce(sum(case when o."status" = 'requested' and o."hold_expires_at" > now() then oi."quantity" * m."capacity_weight" else 0 end), 0)::int as "held"
      from "orders" o
      join "order_items" oi on oi."order_id" = o."id"
      join "menu_items" m on m."id" = oi."menu_item_id"
      where o."drop_id" = ${drop.id}`
    expect(drop.spacesLeft).toBe(Math.max(0, drop.capacity - (row?.confirmed ?? 0) - (row?.held ?? 0)))
  })

  it('flags sold-out items and only offers the main-flow sizes', async () => {
    const body = nextDropResponse.parse(await $fetch('/api/drops/next'))
    expect(body.menu.length).toBeGreaterThan(0)
    for (const item of body.menu) {
      expect(['330ml', '500ml']).toContain(item.size)
      expect(item.soldOut).toBe(!fitsInDrop(item.capacityWeight, body.drop?.spacesLeft ?? 0))
    }
  })

  it('rejects unknown query parameters', async () => {
    const response = await fetch('/api/drops/next?surprise=1')
    expect(response.status).toBe(400)
  })
})
