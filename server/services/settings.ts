// Reads owner settings, falling back to the sample defaults if a row is missing.
import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { settings } from '../db/schema'
import { settingsDefaults, type SettingKey } from '../db/settings-defaults'

type Settings = typeof settingsDefaults

export async function readSettings<K extends SettingKey>(db: DbOrTx, keys: K[]): Promise<Pick<Settings, K>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, keys))
  const result = {} as Pick<Settings, K>
  for (const key of keys) {
    const row = rows.find((r) => r.key === key)
    result[key] = (row?.value ?? settingsDefaults[key]) as Settings[K]
  }
  return result
}
