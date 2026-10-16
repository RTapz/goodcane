// Saving and restoring the cart in sessionStorage. Pure, so it can be unit tested.

export interface CartLine {
  menuItemId: string
  quantity: number
}

export interface StoredCart {
  dropId: string
  lines: CartLine[]
}

export const CART_STORAGE_KEY = 'goodcane-cart'

/**
 * Turns the stored text back into a cart, or null if there is nothing usable.
 * A cart saved for a different drop is discarded: its items and spaces no longer apply.
 */
export function restoreCart(raw: string | null, currentDropId: string | null): StoredCart | null {
  if (!raw || !currentDropId) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const { dropId, lines } = parsed as { dropId?: unknown; lines?: unknown }
  if (dropId !== currentDropId || !Array.isArray(lines)) {
    return null
  }
  const valid = lines.filter(
    (line): line is CartLine =>
      typeof line === 'object' &&
      line !== null &&
      typeof (line as CartLine).menuItemId === 'string' &&
      Number.isInteger((line as CartLine).quantity) &&
      (line as CartLine).quantity > 0
  )
  return { dropId, lines: valid.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })) }
}
