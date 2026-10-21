import { describe, expect, it } from 'vitest'
import { LOST_LINK_TEXT, lostLinkHelp, privateLinkUrl, reminderLinkUrl, whatsappShareUrl } from '../../../server/domain/identity/share'

describe('lost link help (C8)', () => {
  it('asks for the first name only and never carries a token or a link', () => {
    expect(LOST_LINK_TEXT).toMatch(/first name/i)
    expect(LOST_LINK_TEXT).not.toMatch(/\/c\/|https?:|phone|number/i)
  })

  it('opens a chat with the demo number, or gives just the text when none is set', () => {
    expect(lostLinkHelp('233200000000')).toEqual({
      text: LOST_LINK_TEXT,
      whatsappUrl: `https://wa.me/233200000000?text=${encodeURIComponent(LOST_LINK_TEXT)}`
    })
    expect(lostLinkHelp('')).toEqual({ text: LOST_LINK_TEXT, whatsappUrl: null })
  })
})

describe('privateLinkUrl (BR-L1) and reminderLinkUrl (BR-L5)', () => {
  it('builds /c/{token} without a double slash', () => {
    expect(privateLinkUrl('http://localhost:3000/', 'abc_123')).toBe('http://localhost:3000/c/abc_123')
    expect(privateLinkUrl('https://drops.example', 'abc')).toBe('https://drops.example/c/abc')
  })

  it('builds /r/{token} the same way', () => {
    expect(reminderLinkUrl('https://drops.example/', 'abc')).toBe('https://drops.example/r/abc')
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
