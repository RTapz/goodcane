import { describe, expect, it } from 'vitest'
import { priceOrder } from '../../../server/domain/orders/pricing'

const areas = [
  { id: 'sample-area-a', name: 'Sample area A', feePesewas: 1000 },
  { id: 'sample-area-b', name: 'Sample area B', feePesewas: 1500 }
]
const items = [
  { quantity: 2, unitPricePesewas: 3500, capacityWeight: 1 },
  { quantity: 1, unitPricePesewas: 4500, capacityWeight: 1 }
]

describe('priceOrder (BR-O6)', () => {
  it('charges no fee for pickup', () => {
    expect(priceOrder(items, { kind: 'pickup' }, areas)).toEqual({
      units: 3,
      itemsPesewas: 11500,
      feePesewas: 0,
      totalPesewas: 11500,
      area: null
    })
  })

  it("adds the chosen area's fee for delivery", () => {
    const price = priceOrder(items, { kind: 'delivery', areaId: 'sample-area-b' }, areas)
    expect(price.feePesewas).toBe(1500)
    expect(price.totalPesewas).toBe(13000)
    expect(price.area?.name).toBe('Sample area B')
  })

  it('counts weighted units', () => {
    expect(priceOrder([{ quantity: 1, unitPricePesewas: 18000, capacityWeight: 6 }], { kind: 'pickup' }, areas).units).toBe(6)
  })

  it('rejects an unknown delivery area', () => {
    expect(() => priceOrder(items, { kind: 'delivery', areaId: 'nowhere' }, areas)).toThrow(RangeError)
  })
})
