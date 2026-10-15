// Seeds sample data (spec section 9). For now: owner settings only.
// Safe to rerun: each setting is inserted, or updated if it already exists.
import { existsSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { createDb } from './client'
import { settings } from './schema'
import { settingsDefaults } from './settings-defaults'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const { db, client } = createDb(process.env.DATABASE_URL ?? '')

try {
  const rows = Object.entries(settingsDefaults).map(([key, value]) => ({
    key,
    value,
    isSample: true
  }))

  await db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values(rows)
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded."value"`, isSample: sql`excluded."is_sample"` }
      })
  })

  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(settings)
  console.log(`Seeded ${rows.length} settings. settings table now has ${count?.n} rows.`)
} finally {
  await client.end()
}
