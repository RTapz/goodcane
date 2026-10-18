// Row level security is on for every app table (spec 8). With no policies, the Supabase Data API
// (anon or authenticated roles) can read nothing; the app connects as the owner, which bypasses RLS.
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { testDatabaseUrl } from '../support/test-db'

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(() => sql.end())

describe('row level security', () => {
  it('is enabled on every table in the public schema', async () => {
    const rows = await sql<{ name: string; rls: boolean }[]>`
      select c."relname" as "name", c."relrowsecurity" as "rls"
      from "pg_class" c join "pg_namespace" n on n."oid" = c."relnamespace"
      where n."nspname" = 'public' and c."relkind" = 'r'`
    expect(rows.length).toBeGreaterThanOrEqual(15)
    expect(rows.filter((r) => !r.rls).map((r) => r.name)).toEqual([])
  })

  it('has no policies, so nothing is opened to the Data API by accident', async () => {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as "n" from "pg_policies" where "schemaname" = 'public'`
    expect(row?.n).toBe(0)
  })
})
