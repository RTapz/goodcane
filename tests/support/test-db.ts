// Shared by integration and API tests. They write real rows, so they only ever run
// against a database whose name ends in _test.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const rootDir = fileURLToPath(new URL('../..', import.meta.url))

export function testDatabaseUrl(): string {
  if (existsSync(`${rootDir}/.env`)) {
    process.loadEnvFile(`${rootDir}/.env`)
  }
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Add it to .env, pointing at a database ending in _test.')
  }
  let name: string
  try {
    name = new URL(url).pathname.replace(/^\//, '')
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL.')
  }
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests: database "${name}" does not end in _test.`)
  }
  return url
}
