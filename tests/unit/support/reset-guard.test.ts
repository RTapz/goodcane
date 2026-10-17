import type postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { resetTestDatabase } from '../../support/reset-test-db'

/** A stand-in for a postgres client connected to `database`, recording every query it is sent. */
function fakeClient(database: string) {
  const queries: string[] = []
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join('?')
    queries.push(text)
    return Promise.resolve(text.includes('current_database') ? [{ name: database }] : [])
  }) as unknown as postgres.Sql
  return { sql, queries }
}

describe('resetTestDatabase guard', () => {
  it('refuses to truncate a database whose name does not end in _test', async () => {
    const { sql, queries } = fakeClient('goodcane_drops')
    await expect(resetTestDatabase(sql)).rejects.toThrow('does not end in _test')
    expect(queries.some((q) => q.includes('truncate'))).toBe(false)
  })

  it('truncates a *_test database', async () => {
    const { sql, queries } = fakeClient('goodcane_drops_test')
    await resetTestDatabase(sql)
    expect(queries.some((q) => q.includes('truncate'))).toBe(true)
  })
})
