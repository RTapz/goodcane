// `pnpm seed`: resets all sample data (spec section 9) in ONE transaction.
// Delete sample rows and smoke test leftovers, upsert settings, insert, verify (run.ts).
// Any failure, including verification, rolls everything back.
import { existsSync } from 'node:fs'
import { createDb } from '../client'
import { checkRemoteAllowed } from '../remote-guard'
import { SEED } from './build'
import { runSeed } from './run'

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
  await db.transaction((tx) => runSeed(tx, now))
  console.log('Seed committed.')
} catch (error) {
  console.error(`\n${(error as Error).message}`)
  console.error('\nSeed rolled back: the database is unchanged.')
  process.exitCode = 1
} finally {
  await client.end()
}
