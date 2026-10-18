import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'
import { checkRemoteAllowed } from './server/db/remote-guard'

// drizzle-kit does not read .env by itself; use Node's built-in loader.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

// Migrations need a session (not a transaction pooler) connection: on Supabase, the session
// pooler string. It falls back to DATABASE_URL for local work.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || ''
const isLocal = !url || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname)

// Commands that change a database refuse a remote one unless ALLOW_REMOTE_DB=true (only the host is shown).
if (url && process.argv.some((arg) => arg === 'migrate' || arg === 'push')) {
  const target = checkRemoteAllowed(url, process.env.ALLOW_REMOTE_DB)
  if (!target.ok) {
    console.error(target.message)
    process.exit(1)
  }
  console.log(`Target database host: ${target.host}`)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  // Remote databases always get SSL. The string is parsed here, never printed.
  dbCredentials: isLocal
    ? { url }
    : (() => {
        const u = new URL(url)
        return {
          host: u.hostname,
          port: Number(u.port || 5432),
          user: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
          database: u.pathname.slice(1) || 'postgres',
          ssl: 'require' as const
        }
      })(),
  strict: true,
  verbose: true
})
