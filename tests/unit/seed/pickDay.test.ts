import { describe, expect, it } from 'vitest'
import { pickDay } from '../../../server/db/seed/pickDay'

/** A fake rand that always returns the same value. */
const always = (value: number) => () => value

describe('pickDay (spec section 9)', () => {
  it.each([
    [0, 5],
    [0.19, 5],
    [0.2, 4],
    [0.59, 3],
    [0.6, 2],
    [0.999, 0]
  ])('maps rand %s to day %s', (value, day) => {
    expect(pickDay(always(value))).toBe(day)
  })

  it('calls rand exactly once', () => {
    let calls = 0
    pickDay(() => {
      calls += 1
      return 0.5
    })
    expect(calls).toBe(1)
  })

  it('throws a RangeError with the point and total when rand is 1', () => {
    expect(() => pickDay(always(1))).toThrow(RangeError)
    expect(() => pickDay(always(1))).toThrow('point 100 is not in [0, 100)')
  })

  it.each([-0.1, Number.NaN, 1.5])('throws a RangeError when rand is %s', (value) => {
    expect(() => pickDay(always(value))).toThrow(RangeError)
  })
})
