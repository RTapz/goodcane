// `pnpm seed`: resets all sample data (spec section 9) in ONE transaction.
// Delete sample rows (children first), upsert settings, insert, verify.
// Any failure, including verification, rolls everything back.
import { existsSync } from 'node:fs'
import { eq, inArray, or, sql } from 'drizzle-orm'
import { createDb, type Db } from '../client'
import { checkRemoteAllowed } from '../remote-guard'
import * as schema from '../schema'
import { settingsDefaults } from '../settings-defaults'
import { buildSampleData, SEED, type SampleData } from './build'
import { createRand } from './random'
import { verifySeed } from './verify'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const HOUR = 60 * 60 * 1000

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

/** Now floored to the hour, so two runs in the same hour are identical. SEED_NOW overrides it. */
function seedNow(): Date {
  const override = process.env.SEED_NOW
  if (override) {
    const date = new Date(override)
    if (Number.isNaN(date.getTime())) {
      throw new Error(`SEED_NOW is not a valid date: ${override}`)
    }
    return date
  }
  return new Date(Math.floor(Date.now() / HOUR) * HOUR)
}

async function deleteSampleRows(tx: Tx) {
  // Children before parents, so no foreign key blocks a delete.
  await tx.delete(schema.orderHistory).where(eq(schema.orderHistory.isSample, true))
  await tx.delete(schema.payments).where(eq(schema.payments.isSample, true))
  await tx.delete(schema.orderItems).where(eq(schema.orderItems.isSample, true))
  await tx.delete(schema.reminders).where(eq(schema.reminders.isSample, true))
  await tx.delete(schema.turnedAway).where(eq(schema.turnedAway.isSample, true))
  await tx.delete(schema.forecastSnapshots).where(eq(schema.forecastSnapshots.isSample, true))
  await tx.delete(schema.consentEvents).where(eq(schema.consentEvents.isSample, true))
  await tx.delete(schema.accessTokens).where(eq(schema.accessTokens.isSample, true))

  // Orders: sample ones, plus any order on a sample drop (it would block deleting the drop).
  // Their remaining children go with them through ON DELETE CASCADE.
  const sampleDropIds = tx.select({ id: schema.drops.id }).from(schema.drops).where(eq(schema.drops.isSample, true))
  const removed = await tx
    .delete(schema.orders)
    .where(or(eq(schema.orders.isSample, true), inArray(schema.orders.dropId, sampleDropIds)))
    .returning({ isSample: schema.orders.isSample })
  const nonSample = removed.filter((o) => !o.isSample).length
  if (nonSample > 0) {
    console.log(`Removed ${nonSample} non-sample orders that were on sample drops.`)
  }

  await tx.delete(schema.customers).where(eq(schema.customers.isSample, true))
  await tx.delete(schema.menuItems).where(eq(schema.menuItems.isSample, true))
  await tx.delete(schema.drops).where(eq(schema.drops.isSample, true))
}

async function upsertSettings(tx: Tx) {
  const rows = Object.entries(settingsDefaults).map(([key, value]) => ({ key, value, isSample: true }))
  await tx
    .insert(schema.settings)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: sql`excluded."value"`, isSample: sql`excluded."is_sample"` }
    })
}

async function insertInChunks<T extends Record<string, unknown>>(
  tx: Tx,
  table: Parameters<Tx['insert']>[0],
  rows: T[]
) {
  for (let i = 0; i < rows.length; i += 500) {
    await tx.insert(table).values(rows.slice(i, i + 500) as never)
  }
}

async function insertSampleData(tx: Tx, data: SampleData) {
  // Parents before children.
  await insertInChunks(tx, schema.menuItems, data.menuItems)
  await insertInChunks(tx, schema.drops, data.drops)
  await insertInChunks(tx, schema.customers, data.customers)
  await insertInChunks(tx, schema.orders, data.orders)
  await insertInChunks(tx, schema.orderItems, data.orderItems)
  await insertInChunks(tx, schema.payments, data.payments)
  await insertInChunks(tx, schema.orderHistory, data.orderHistory)
  await insertInChunks(tx, schema.turnedAway, data.turnedAway)
  await insertInChunks(tx, schema.consentEvents, data.consentEvents)
  await insertInChunks(tx, schema.reminders, data.reminders)
  await insertInChunks(tx, schema.forecastSnapshots, data.forecastSnapshots)
}

const now = seedNow()
console.log(`Seeding sample data (seed ${SEED}, now ${now.toISOString()})`)

// Seeding uses the session connection, like migrations (MIGRATION_DATABASE_URL, else DATABASE_URL).
// A remote database needs ALLOW_REMOTE_DB=true on this one command; only its host is printed.
const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || ''
const target = checkRemoteAllowed(databaseUrl || 'postgresql://localhost', process.env.ALLOW_REMOTE_DB)
if (!target.ok) {
  console.error(target.message)
  process.exit(1)
}
console.log(`Target database host: ${target.host}${target.remote ? ' (remote, allowed by ALLOW_REMOTE_DB=true)' : ''}`)
const { db, client } = createDb(databaseUrl)
try {
  const data = buildSampleData({ rand: createRand(SEED), now })
  await db.transaction(async (tx) => {
    await deleteSampleRows(tx)
    await upsertSettings(tx)
    await insertSampleData(tx, data)
    await verifySeed(tx)
  })
  console.log('Seed committed.')
} catch (error) {
  console.error(`\n${(error as Error).message}`)
  console.error('\nSeed rolled back: the database is unchanged.')
  process.exitCode = 1
} finally {
  await client.end()
}
