// Sample menu (spec 6.4). Flavours mirror the public menu as observed; prices are samples.

export type TasteGroup = 'sweet' | 'spicy' | 'sour'
export type ItemSize = '330ml' | '500ml' | '2l' | '4l'

interface Flavour {
  name: string
  tasteGroup: TasteGroup
  isSpecial: boolean
  /** The four main flavours also come in group sizes (2L, 4L). */
  groupSizes: boolean
}

export const flavours: Flavour[] = [
  { name: 'Raw cane', tasteGroup: 'sweet', isSpecial: false, groupSizes: true },
  { name: 'Passionfruit cane', tasteGroup: 'sweet', isSpecial: false, groupSizes: true },
  { name: 'Ginger-lemon cane', tasteGroup: 'spicy', isSpecial: false, groupSizes: true },
  { name: 'Lemon-mint cane', tasteGroup: 'sour', isSpecial: false, groupSizes: true },
  { name: 'Lemon-charcoal cane', tasteGroup: 'sour', isSpecial: false, groupSizes: false },
  // Drop specials. Cucumber is really "fresh"; sour is the nearest of the three groups.
  { name: 'Tigernut-coconut cane', tasteGroup: 'sweet', isSpecial: true, groupSizes: false },
  { name: 'Cucumber cane', tasteGroup: 'sour', isSpecial: true, groupSizes: false },
  { name: 'Passionlemon cane', tasteGroup: 'sour', isSpecial: true, groupSizes: false }
]

/** Sample price in pesewas and capacity weight per size (BR-C1). */
export const sizes: Record<ItemSize, { pricePesewas: number; capacityWeight: number }> = {
  '330ml': { pricePesewas: 3500, capacityWeight: 1 },
  '500ml': { pricePesewas: 4500, capacityWeight: 1 },
  '2l': { pricePesewas: 18000, capacityWeight: 6 },
  '4l': { pricePesewas: 26000, capacityWeight: 12 }
}

/** Sizes used in the main ordering flow. Group sizes are P2, so seeded orders use these only. */
export const mainFlowSizes: ItemSize[] = ['330ml', '500ml']

export function sizesFor(flavour: Flavour): ItemSize[] {
  return flavour.groupSizes ? ['330ml', '500ml', '2l', '4l'] : ['330ml', '500ml']
}
