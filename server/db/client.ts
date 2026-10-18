import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * postgres.js settings for a connection string.
 *
 * Pooled (Supabase transaction pooler, port 6543, or DATABASE_POOL_MODE=transaction):
 * - prepare: false, because a transaction pooler hands each transaction to whichever server
 *   connection is free, so a statement prepared on one connection may not exist on the next;
 * - max: 1, because each serverless instance needs only one connection and the pooler does
 *   the sharing.
 * Any host that is not this computer gets SSL.
 */
export function connectionOptions(databaseUrl: string, poolMode: string | undefined) {
  const url = new URL(databaseUrl)
  const pooled = poolMode === 'transaction' || url.port === '6543'
  const ssl = LOCAL_HOSTS.has(url.hostname) ? undefined : ('require' as const)
  return pooled ? { prepare: false, max: 1, ssl } : { max: 5, ssl }
}

/**
 * Creates a Drizzle client over postgres.js. Callers pass the URL so this file
 * works both in CLI scripts (process.env) and in the Nuxt server (runtimeConfig).
 */
export function createDb(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }
  const client = postgres(databaseUrl, connectionOptions(databaseUrl, process.env.DATABASE_POOL_MODE))
  const db = drizzle(client, { schema })
  return { db, client }
}

export type Db = ReturnType<typeof createDb>['db']
/** A transaction handle, as passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Queries that work both inside and outside a transaction take this. */
export type DbOrTx = Db | Tx
