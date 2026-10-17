import { describe, expect, it } from 'vitest'
import { maskPhone, normalisePhone } from '../../../server/domain/identity/phone'

describe('normalisePhone (BR-L9)', () => {
  it.each(['0241234567', '024 123 4567', '024-123-4567', '+233241234567', '+233 24 123 4567'])(
    'accepts %s as +233241234567',
    (input) => {
      expect(normalisePhone(input)).toEqual({ ok: true, phone: '+233241234567' })
    }
  )

  it.each(['241234567', '233241234567', '+2330241234567', '02412345678', '024123456', 'phone', '', '+44 7700 900123'])(
    'rejects %j with a clear message',
    (input) => {
      const result = normalisePhone(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toContain('Ghana mobile number')
    }
  )
})

describe('maskPhone (BR-L8)', () => {
  it('shows only the last 3 digits', () => {
    expect(maskPhone('+233241234567')).toBe('••••••••••567')
  })
})
