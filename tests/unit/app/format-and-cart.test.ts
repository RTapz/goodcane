import { describe, expect, it } from 'vitest'
import { restoreCart } from '../../../app/utils/cart-storage'
import { formatCutOff, formatDropDate, formatPesewas, plural, splitDuration } from '../../../app/utils/format'

describe('formatting', () => {
  it('shows pesewas as cedis', () => {
    expect(formatPesewas(3500)).toBe('GH₵35.00')
    expect(formatPesewas(12550)).toBe('GH₵125.50')
  })

  it('shows dates in Africa/Accra', () => {
    expect(formatDropDate('2026-10-20T12:00:00Z')).toBe('Tuesday 20 October')
    expect(formatCutOff('2026-10-17T12:00:00Z')).toBe('Saturday 17 October at 12:00')
  })

  it('pluralises counts', () => {
    expect(plural(1, 'space', 'spaces')).toBe('1 space')
    expect(plural(0, 'space', 'spaces')).toBe('0 spaces')
    expect(plural(3, 'space', 'spaces')).toBe('3 spaces')
  })

  it('splits a duration for the countdown', () => {
    expect(splitDuration(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 })
    expect(splitDuration(-1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })
})

describe('restoreCart', () => {
  const saved = JSON.stringify({ dropId: 'drop-1', lines: [{ menuItemId: 'raw-330', quantity: 2 }] })

  it('restores a cart saved for the current drop', () => {
    expect(restoreCart(saved, 'drop-1')).toEqual({ dropId: 'drop-1', lines: [{ menuItemId: 'raw-330', quantity: 2 }] })
  })

  it('discards a cart saved for a different drop', () => {
    expect(restoreCart(saved, 'drop-2')).toBeNull()
  })

  it('discards nothing usable: empty, broken JSON or no current drop', () => {
    expect(restoreCart(null, 'drop-1')).toBeNull()
    expect(restoreCart('{not json', 'drop-1')).toBeNull()
    expect(restoreCart(saved, null)).toBeNull()
  })

  it('drops lines with a bad quantity', () => {
    const raw = JSON.stringify({
      dropId: 'drop-1',
      lines: [
        { menuItemId: 'a', quantity: 0 },
        { menuItemId: 'b', quantity: 1.5 },
        { menuItemId: 'c', quantity: 1 }
      ]
    })
    expect(restoreCart(raw, 'drop-1')?.lines).toEqual([{ menuItemId: 'c', quantity: 1 }])
  })
})
