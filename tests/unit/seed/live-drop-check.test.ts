// The seed's live drop check (spec section 9): about 30 paid, about 10 requested, spaces left.
import { describe, expect, it } from 'vitest'
import { checkLiveDrop } from '../../../server/db/seed/verify'

const fresh = { capacity: 70, paidUnits: 30, heldUnits: 0, requestedUnits: 10 }

describe('checkLiveDrop', () => {
  it('accepts a freshly seeded live drop', () => {
    expect(checkLiveDrop(fresh)).toEqual([])
  })

  it('accepts the edges of the paid and requested ranges', () => {
    expect(checkLiveDrop({ ...fresh, paidUnits: 28, requestedUnits: 9 })).toEqual([])
    expect(checkLiveDrop({ ...fresh, paidUnits: 36, requestedUnits: 16 })).toEqual([])
  })

  it('rejects paid or requested units outside the ranges', () => {
    expect(checkLiveDrop({ ...fresh, paidUnits: 27 })).toEqual(['live drop has 27 paid units, expected 28 to 36'])
    expect(checkLiveDrop({ ...fresh, requestedUnits: 17 })).toEqual(['live drop has 17 requested units, expected 9 to 16'])
  })

  it('rejects a full drop, counting active holds like customers see it', () => {
    const problems = checkLiveDrop({ ...fresh, capacity: 34, heldUnits: 4 })
    expect(problems).toEqual(['live drop has no spaces left (capacity 34, 30 paid, 4 held)'])
  })
})
