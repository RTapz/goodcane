import { orderTotalPesewas, orderUnits } from './totals'

export interface PricedItem {
  quantity: number
  /** From the database, never the client. */
  unitPricePesewas: number
  capacityWeight: number
}

export interface Area {
  id: string
  name: string
  feePesewas: number
}

export type Fulfilment = { kind: 'pickup' } | { kind: 'delivery'; areaId: string }

export interface OrderPrice {
  units: number
  itemsPesewas: number
  feePesewas: number
  totalPesewas: number
  /** The chosen delivery area, or null for pickup. */
  area: Area | null
}

/** Prices an order from database values. Delivery adds the owner's area fee (BR-O6). */
export function priceOrder(items: PricedItem[], fulfilment: Fulfilment, areas: Area[]): OrderPrice {
  let area: Area | null = null
  if (fulfilment.kind === 'delivery') {
    area = areas.find((a) => a.id === fulfilment.areaId) ?? null
    if (!area) {
      throw new RangeError(`Unknown delivery area: ${fulfilment.areaId}`)
    }
  }
  const feePesewas = area?.feePesewas ?? 0
  const itemsPesewas = orderTotalPesewas(items)
  return {
    units: orderUnits(items),
    itemsPesewas,
    feePesewas,
    totalPesewas: orderTotalPesewas(items, feePesewas),
    area
  }
}
