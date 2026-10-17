import { afterEach, describe, expect, it } from 'vitest'
import { testDatabaseUrl } from '../../support/test-db'

const original = process.env.TEST_DATABASE_URL
afterEach(() => {
  if (original === undefined) delete process.env.TEST_DATABASE_URL
  else process.env.TEST_DATABASE_URL = original
})

describe('test database guard', () => {
  it('refuses a database whose name does not end in _test', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/goodcane_drops'
    expect(() => testDatabaseUrl()).toThrow('does not end in _test')
  })

  it('refuses a name that only contains _test somewhere else', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/my_test_copy'
    expect(() => testDatabaseUrl()).toThrow('does not end in _test')
  })

  it('accepts a *_test database', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/goodcane_drops_test'
    expect(testDatabaseUrl()).toBe('postgresql://u:p@localhost:5432/goodcane_drops_test')
  })
})
