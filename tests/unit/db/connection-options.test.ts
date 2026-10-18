// Connection settings for the Supabase poolers (spec 8). Made-up hosts and no real credentials.
import { describe, expect, it } from 'vitest'
import { connectionOptions } from '../../../server/db/client'

describe('connectionOptions', () => {
  it('transaction pooler (port 6543): no prepared statements, one connection, SSL', () => {
    expect(connectionOptions('postgresql://app:x@pooler.example.com:6543/postgres', undefined)).toEqual({
      prepare: false,
      max: 1,
      ssl: 'require'
    })
  })

  it('session pooler or any other remote host: normal pool, SSL', () => {
    expect(connectionOptions('postgresql://app:x@pooler.example.com:5432/postgres', undefined)).toEqual({ max: 5, ssl: 'require' })
  })

  it('local database: no SSL, and DATABASE_POOL_MODE=transaction forces pooled settings for testing', () => {
    expect(connectionOptions('postgresql://app:x@localhost:5432/goodcane_drops', undefined)).toEqual({ max: 5, ssl: undefined })
    expect(connectionOptions('postgresql://app:x@localhost:5432/goodcane_drops', 'transaction')).toEqual({
      prepare: false,
      max: 1,
      ssl: undefined
    })
  })
})
