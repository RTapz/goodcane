import { describe, expect, it } from 'vitest'
import { getCutOff } from '../../../server/domain/drops'

// Accra is UTC+0 with no daylight saving, so UTC days are Accra days.
describe('getCutOff (BR-D2)', () => {
  it('closes a Friday drop with 3 days lead time on Tuesday', () => {
    const friday = new Date('2026-10-23T12:00:00Z')
    const cutOff = getCutOff(friday, 3)

    expect(cutOff.toISOString()).toBe('2026-10-20T12:00:00.000Z')
    expect(cutOff.getUTCDay()).toBe(2)
  })

  it('closes a Tuesday drop with 3 days lead time on Saturday', () => {
    const tuesday = new Date('2026-10-20T12:00:00Z')
    const cutOff = getCutOff(tuesday, 3)

    expect(cutOff.toISOString()).toBe('2026-10-17T12:00:00.000Z')
    expect(cutOff.getUTCDay()).toBe(6)
  })

  it('does not change the drop date passed in', () => {
    const dropAt = new Date('2026-10-23T12:00:00Z')
    getCutOff(dropAt, 3)

    expect(dropAt.toISOString()).toBe('2026-10-23T12:00:00.000Z')
  })

  it.each([-1, 1.5, Number.NaN])('rejects a lead time of %s days', (leadTimeDays) => {
    expect(() => getCutOff(new Date('2026-10-23T12:00:00Z'), leadTimeDays)).toThrow(RangeError)
  })

  it('rejects an invalid drop date', () => {
    expect(() => getCutOff(new Date('not a date'), 3)).toThrow(RangeError)
  })
})
