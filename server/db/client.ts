import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Creates a Drizzle client over postgres.js. Callers pass the URL so this file
 * works both in CLI scripts (process.env) and in the Nuxt server (runtimeConfig).
 */
export function createDb(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }
  const client = postgres(databaseUrl, { max: 5 })
  const db = drizzle(client, { schema })
  return { db, client }
}

export type Db = ReturnType<typeof createDb>['db']
/** A transaction handle, as passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Queries that work both inside and outside a transaction take this. */
export type DbOrTx = Db | Tx
