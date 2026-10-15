import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit does not read .env by itself; use Node's built-in loader.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ''
  },
  strict: true,
  verbose: true
})
