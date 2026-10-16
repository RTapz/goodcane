import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { orderTotalPesewas, orderUnits } from '../../../server/domain/orders/totals'

describe('orderUnits (BR-C1)', () => {
  it('counts 2 x 330ml and 1 x 500ml as 3 units', () => {
    expect(
      orderUnits([
        { quantity: 2, capacityWeight: 1 },
        { quantity: 1, capacityWeight: 1 }
      ])
    ).toBe(3)
  })

  it('weights group sizes: one 2L counts 6 and one 4L counts 12', () => {
    expect(
      orderUnits([
        { quantity: 1, capacityWeight: 6 },
        { quantity: 1, capacityWeight: 12 }
      ])
    ).toBe(18)
  })

  it('is 0 for an empty cart', () => {
    expect(orderUnits([])).toBe(0)
  })

  it.each([-1, 1.5])('rejects a quantity of %s', (quantity) => {
    expect(() => orderUnits([{ quantity, capacityWeight: 1 }])).toThrow(RangeError)
  })
})

describe('orderTotalPesewas', () => {
  const lines = [
    { quantity: 2, unitPricePesewas: 3500 },
    { quantity: 1, unitPricePesewas: 4500 }
  ]

  it('adds up 2 x GH₵35 and 1 x GH₵45 as 11500 pesewas', () => {
    expect(orderTotalPesewas(lines)).toBe(11500)
  })

  it('adds a delivery fee', () => {
    expect(orderTotalPesewas(lines, 1000)).toBe(12500)
  })

  it('is 0 for an empty cart with no fee', () => {
    expect(orderTotalPesewas([])).toBe(0)
  })

  it('rejects a price that is not whole pesewas, or a negative fee', () => {
    expect(() => orderTotalPesewas([{ quantity: 1, unitPricePesewas: 35.5 }])).toThrow(RangeError)
    expect(() => orderTotalPesewas(lines, -100)).toThrow(RangeError)
  })
})

describe('totals.ts stays safe for the browser bundle', () => {
  it('has no imports from drizzle, postgres or node:*', () => {
    const source = readFileSync(new URL('../../../server/domain/orders/totals.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const path of imports) {
      expect(path).not.toMatch(/^(drizzle-orm|postgres|node:)/)
    }
  })
})
