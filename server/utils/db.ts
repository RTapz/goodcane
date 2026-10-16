import { createDb, type Db } from '../db/client'

let db: Db | undefined

/** One shared database client for all server routes. */
export function useDb(): Db {
  if (!db) {
    db = createDb(useRuntimeConfig().databaseUrl).db
  }
  return db
}
