// Runs once before the API tests: checks the database name, migrates it and loads the seed.
import { execFileSync } from 'node:child_process'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resetTestDatabase } from '../support/reset-test-db'
import { rootDir, testDatabaseUrl } from '../support/test-db'

export default async function setup() {
  const url = testDatabaseUrl()
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: `${rootDir}/server/db/migrations` })
    // Start from empty: leftovers from other test runs (not is_sample) would block the seed.
    await resetTestDatabase(client)
  } finally {
    await client.end()
  }
  // The seed reads DATABASE_URL; values already in the environment win over .env.
  execFileSync(process.execPath, [`${rootDir}/node_modules/tsx/dist/cli.mjs`, 'server/db/seed/index.ts'], {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'ignore', 'inherit']
  })
}
