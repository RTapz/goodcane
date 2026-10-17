// Runs once before the integration tests: checks the database name, then applies migrations.
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { rootDir, testDatabaseUrl } from '../support/test-db'

export default async function setup() {
  const client = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: `${rootDir}/server/db/migrations` })
  } finally {
    await client.end()
  }
}
