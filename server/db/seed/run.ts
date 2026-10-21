// The work of `pnpm seed` inside one transaction: delete sample rows (and smoke test leftovers),
// upsert settings, insert, verify. index.ts is the command line around it.
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { Db } from '../client'
import * as schema from '../schema'
import { settingsDefaults } from '../settings-defaults'
import { buildSampleData, SEED, type SampleData } from './build'
import { createRand } from './random'
import { SMOKE_FIRST_NAME, SMOKE_PHONE } from './smoke-marker'
import { verifySeed } from './verify'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function deleteSampleRows(tx: Tx) {
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

  // Smoke test customers, flagged or not (a deployment outside demo mode writes them unflagged).
  // Their tokens and reminders cascade; their consent rows would only be orphaned, so they go first.
  const smoke = and(eq(schema.customers.firstName, SMOKE_FIRST_NAME), eq(schema.customers.phone, SMOKE_PHONE))
  const smokeIds = tx.select({ id: schema.customers.id }).from(schema.customers).where(smoke)
  await tx.delete(schema.consentEvents).where(inArray(schema.consentEvents.customerId, smokeIds))
  const smokeRemoved = await tx.delete(schema.customers).where(smoke).returning({ id: schema.customers.id })
  if (smokeRemoved.length > 0) {
    console.log(`Removed ${smokeRemoved.length} smoke test customers.`)
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
  await insertInChunks(tx, schema.accessTokens, data.accessTokens)
  await insertInChunks(tx, schema.orders, data.orders)
  await insertInChunks(tx, schema.orderItems, data.orderItems)
  await insertInChunks(tx, schema.payments, data.payments)
  await insertInChunks(tx, schema.orderHistory, data.orderHistory)
  await insertInChunks(tx, schema.turnedAway, data.turnedAway)
  await insertInChunks(tx, schema.consentEvents, data.consentEvents)
  await insertInChunks(tx, schema.reminders, data.reminders)
  await insertInChunks(tx, schema.forecastSnapshots, data.forecastSnapshots)
}

/**
 * The whole seed, inside the caller's transaction. Throws (so the caller rolls back) if verification
 * fails. `demoMode` adds Demo Customer A and its fixed link (BR-L4 exception); never outside demo mode.
 */
export async function runSeed(tx: Tx, now: Date, options: { demoMode?: boolean } = {}) {
  const demoMode = options.demoMode ?? false
  const data = buildSampleData({ rand: createRand(SEED), now, demoCustomer: demoMode })
  await deleteSampleRows(tx)
  await upsertSettings(tx)
  await insertSampleData(tx, data)
  await verifySeed(tx, now, { demoMode })
}
