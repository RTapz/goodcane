// "Your usual" for C7 (spec 6.3): the last paid order, checked against today's menu and spaces.
// Pure, and safe for the browser bundle: no database, Node or Vue imports.
// Nothing is changed silently: substitutes need accepting, capped quantities are only suggested.

export type TasteGroup = 'sweet' | 'spicy' | 'sour'

export interface LastLine {
  menuItemId: string
  name: string
  tasteGroup: TasteGroup
  size: string
  quantity: number
  /** What the customer paid last time. */
  unitPricePesewas: number
}

export interface MenuOption {
  id: string
  name: string
  tasteGroup: TasteGroup
  size: string
  pricePesewas: number
  capacityWeight: number
  isSpecial: boolean
  /** Active and not sold out in this drop. */
  available: boolean
}

export type UsualStatus = 'ok' | 'price_changed' | 'substituted' | 'unavailable' | 'too_big_for_space'

export interface UsualLine {
  last: LastLine
  /** The item that would be ordered: the same item, or an accepted substitute; null if none. */
  item: MenuOption | null
  /** Offered when the usual item is unavailable. Counts only once accepted. */
  substitute: MenuOption | null
  accepted: boolean
  quantity: number
  status: UsualStatus
  /** Always filled, so a price change can be shown alongside another status. */
  price: { oldPesewas: number; newPesewas: number | null }
  /** A suggested lower quantity when this line does not fit the spaces left. Never applied here. */
  cappedQuantity: number | null
}

export interface UsualOrder {
  lines: UsualLine[]
  /** True only when every line that will be ordered fits as it is, and at least one line will be ordered. */
  fits: boolean
  units: number
  totalPesewas: number
}

export interface UsualChoices {
  /** Quantity changed inline, keyed by the last line's menu item id. */
  quantities?: Record<string, number>
  /** Substitutes the customer accepted, keyed by the last line's menu item id. */
  acceptedSubstitutes?: Record<string, boolean>
}

const bySpecialThenName = (a: MenuOption, b: MenuOption) =>
  Number(a.isSpecial) - Number(b.isSpecial) || a.name.localeCompare(b.name)

/**
 * Nearest available item in the same taste group: same size first (other flavours),
 * then the other size (same flavour first). Non-specials before drop specials, then by name.
 */
export function findSubstitute(last: LastLine, menu: MenuOption[]): MenuOption | null {
  const candidates = menu.filter((m) => m.available && m.tasteGroup === last.tasteGroup && m.id !== last.menuItemId)
  const sameSize = candidates.filter((m) => m.size === last.size).sort(bySpecialThenName)
  if (sameSize[0]) return sameSize[0]
  const otherSize = candidates
    .filter((m) => m.size !== last.size)
    .sort((a, b) => Number(b.name === last.name) - Number(a.name === last.name) || bySpecialThenName(a, b))
  return otherSize[0] ?? null
}

export function buildUsualOrder(
  lastLines: LastLine[],
  menu: MenuOption[],
  spacesLeft: number,
  choices: UsualChoices = {}
): UsualOrder {
  let remaining = Math.max(0, spacesLeft)
  let units = 0
  let totalPesewas = 0
  let allFit = true

  const lines = lastLines.map((last): UsualLine => {
    const quantity = Math.max(0, Math.floor(choices.quantities?.[last.menuItemId] ?? last.quantity))
    const same = menu.find((m) => m.id === last.menuItemId && m.available) ?? null
    const substitute = same ? null : findSubstitute(last, menu)
    const accepted = !!substitute && !!choices.acceptedSubstitutes?.[last.menuItemId]
    const item = same ?? (accepted ? substitute : null)

    let cappedQuantity: number | null = null
    if (item && quantity > 0) {
      const needed = quantity * item.capacityWeight
      if (needed > remaining) {
        cappedQuantity = Math.floor(remaining / item.capacityWeight)
        allFit = false
      }
      remaining = Math.max(0, remaining - Math.min(needed, (cappedQuantity ?? quantity) * item.capacityWeight))
      units += needed
      totalPesewas += quantity * item.pricePesewas
    }

    const newPesewas = (same ?? substitute)?.pricePesewas ?? null
    const status: UsualStatus = !same && !substitute
      ? 'unavailable'
      : !same
        ? 'substituted'
        : cappedQuantity !== null
          ? 'too_big_for_space'
          : newPesewas !== last.unitPricePesewas
            ? 'price_changed'
            : 'ok'

    return {
      last,
      item,
      substitute,
      accepted,
      quantity,
      status,
      price: { oldPesewas: last.unitPricePesewas, newPesewas },
      cappedQuantity
    }
  })

  const ordering = lines.filter((l) => l.item && l.quantity > 0)
  return { lines, fits: allFit && ordering.length > 0, units, totalPesewas }
}
