// `pnpm retention [--dry-run]`: deletes the personal data of customers inactive for the retention
// period (BR-DP1, BR-DP3), keeping their orders anonymised. Prints the target host and counts only,
// never names or phones. A remote database needs ALLOW_REMOTE_DB=true on this one command.
import { existsSync } from 'node:fs'
import { purgeInactiveCustomers } from '../services/retention'
import { createDb } from './client'
import { checkRemoteAllowed } from './remote-guard'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const dryRun = process.argv.includes('--dry-run')
const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || ''
const target = checkRemoteAllowed(databaseUrl || 'postgresql://localhost', process.env.ALLOW_REMOTE_DB)
if (!target.ok) {
  console.error(target.message)
  process.exit(1)
}
console.log(`Target database host: ${target.host}${target.remote ? ' (remote, allowed by ALLOW_REMOTE_DB=true)' : ''}`)
console.log(dryRun ? 'Dry run: nothing will be changed.' : 'Purging inactive customers.')

const { db, client } = createDb(databaseUrl)
try {
  const { inactive, purged } = await purgeInactiveCustomers(db, new Date(), { dryRun })
  console.log(`Inactive customers: ${inactive}`)
  console.log(dryRun ? 'Would purge: ' + inactive : `Purged: ${purged}`)
} catch (error) {
  console.error(`\n${(error as Error).message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
