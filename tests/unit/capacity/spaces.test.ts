import { describe, expect, it } from 'vitest'
import { fitsInDrop, spacesLeft } from '../../../server/domain/capacity'

describe('spacesLeft (BR-C2)', () => {
  it('is capacity minus paid units minus active holds', () => {
    expect(spacesLeft({ capacity: 70, confirmedUnits: 30, heldUnits: 5 })).toBe(35)
  })

  it('never goes below 0', () => {
    expect(spacesLeft({ capacity: 50, confirmedUnits: 50, heldUnits: 3 })).toBe(0)
  })
})

describe('fitsInDrop', () => {
  it('fits exactly at the edge and not one past it', () => {
    expect(fitsInDrop(5, 5)).toBe(true)
    expect(fitsInDrop(6, 5)).toBe(false)
  })
})
