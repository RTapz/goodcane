import { describe, expect, it } from 'vitest'
import { privateLinkUrl, whatsappShareUrl } from '../../../server/domain/identity/share'

describe('privateLinkUrl (BR-L1)', () => {
  it('builds /c/{token} without a double slash', () => {
    expect(privateLinkUrl('http://localhost:3000/', 'abc_123')).toBe('http://localhost:3000/c/abc_123')
    expect(privateLinkUrl('https://drops.example', 'abc')).toBe('https://drops.example/c/abc')
  })
})

describe('whatsappShareUrl (constraint 3)', () => {
  it('uses only the demo number, as digits, with the text encoded', () => {
    expect(whatsappShareUrl('+233 20 000 0000', 'My link: https://x/c/a b')).toBe(
      'https://wa.me/233200000000?text=My%20link%3A%20https%3A%2F%2Fx%2Fc%2Fa%20b'
    )
  })

  it('returns null when no demo number is set', () => {
    expect(whatsappShareUrl('', 'hi')).toBeNull()
    expect(whatsappShareUrl('  ', 'hi')).toBeNull()
  })
})
