// Close batch (spec 5.10, BR-B1 to B4). Pure.
import { describe, expect, it } from 'vitest'
import { closeBatch, closeMode, EARLY_CLOSE_WARNING } from '../../../server/domain/batch/close'

describe('closeBatch (BR-B1 to B3)', () => {
  it('keeps the identity: made = orders sold + unplanned sold + wasted', () => {
    expect(closeBatch({ ordersSold: 40, unitsMade: 60, unplannedSold: 12, wasted: 8 })).toEqual({ ok: true, wasted: 8, warning: null })
  })

  it('calculates wasted when it is left out', () => {
    expect(closeBatch({ ordersSold: 40, unitsMade: 60, unplannedSold: 12 })).toEqual({ ok: true, wasted: 8, warning: null })
    expect(closeBatch({ ordersSold: 40, unitsMade: 52, unplannedSold: 12 })).toEqual({ ok: true, wasted: 0, warning: null })
  })

  it('refuses a calculated wasted below zero', () => {
    expect(closeBatch({ ordersSold: 40, unitsMade: 50, unplannedSold: 12 })).toEqual({ ok: false, reason: 'negative_wasted' })
  })

  it('warns, without blocking, when all three are entered and the identity fails, with the difference', () => {
    // 60 made, but only 40 + 12 + 5 = 57 accounted for: 3 unaccounted.
    expect(closeBatch({ ordersSold: 40, unitsMade: 60, unplannedSold: 12, wasted: 5 })).toEqual({ ok: true, wasted: 5, warning: { difference: 3 } })
    // 60 made, but 40 + 12 + 10 = 62 accounted for: 2 more than made.
    expect(closeBatch({ ordersSold: 40, unitsMade: 60, unplannedSold: 12, wasted: 10 })).toEqual({ ok: true, wasted: 10, warning: { difference: -2 } })
  })
})

describe('closeMode (BR-B4)', () => {
  const cutOffAt = new Date('2026-10-24T12:00:00Z')
  const before = new Date('2026-10-23T12:00:00Z')
  const base = { cutOffAt, status: 'open' as const, otherOpenDrops: 1 }

  it('after the cut-off: a normal close', () => {
    expect(closeMode({ ...base, now: cutOffAt, demoMode: false })).toEqual({ ok: true, mode: 'after_cut_off' })
  })

  it('before the cut-off: refused outside demo mode, "close early" in demo mode', () => {
    expect(closeMode({ ...base, now: before, demoMode: false })).toEqual({ ok: false, reason: 'not_past_cut_off' })
    expect(closeMode({ ...base, now: before, demoMode: true })).toEqual({ ok: true, mode: 'demo_early' })
  })

  it('demo early close is refused when no other open drop would remain', () => {
    expect(closeMode({ ...base, otherOpenDrops: 0, now: before, demoMode: true })).toEqual({ ok: false, reason: 'last_open_drop' })
  })

  it('a completed drop is already closed', () => {
    expect(closeMode({ ...base, status: 'completed', now: cutOffAt, demoMode: false })).toEqual({ ok: false, reason: 'already_closed' })
  })

  it('the early-close confirmation says what happens', () => {
    expect(EARLY_CLOSE_WARNING).toBe('Closing early removes this drop from customers until the next reseed.')
  })
})
