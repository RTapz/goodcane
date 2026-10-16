import type { MaybeRefOrGetter } from 'vue'
import type { MenuItem } from '~~/server/schemas/drops'
// Imported from the file directly (not the barrel) so only pure arithmetic reaches the browser.
import { orderTotalPesewas, orderUnits } from '../../server/domain/orders/totals'
import { CART_STORAGE_KEY, restoreCart, type StoredCart } from '../utils/cart-storage'

function save(cart: StoredCart) {
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch {
    // Storage can be blocked (private mode, full quota). The cart still works for this page.
  }
}

function load(dropId: string): StoredCart | null {
  try {
    return restoreCart(sessionStorage.getItem(CART_STORAGE_KEY), dropId)
  } catch {
    return null
  }
}

/** The customer's cart, shared across pages and kept in sessionStorage for this tab. */
export function useCart(menu: MaybeRefOrGetter<MenuItem[]> = []) {
  const cart = useState<StoredCart>('cart', () => ({ dropId: '', lines: [] }))

  /** Makes sure the cart belongs to `dropId`, restoring a saved cart for it if there is one. */
  function attachToDrop(dropId: string) {
    if (cart.value.dropId === dropId) return
    cart.value = load(dropId) ?? { dropId, lines: [] }
  }

  /** Moves the cart to another drop. Only call this from an explicit customer choice (BR-F1). */
  function switchDrop(dropId: string) {
    cart.value = { dropId, lines: [] }
    save(cart.value)
  }

  function quantityOf(menuItemId: string): number {
    return cart.value.lines.find((l) => l.menuItemId === menuItemId)?.quantity ?? 0
  }

  function setQuantity(menuItemId: string, quantity: number) {
    const others = cart.value.lines.filter((l) => l.menuItemId !== menuItemId)
    cart.value = {
      ...cart.value,
      lines: quantity > 0 ? [...others, { menuItemId, quantity }] : others
    }
    save(cart.value)
  }

  function clear() {
    cart.value = { ...cart.value, lines: [] }
    save(cart.value)
  }

  const priced = computed(() => {
    const items = toValue(menu)
    return cart.value.lines.flatMap((line) => {
      const item = items.find((i) => i.id === line.menuItemId)
      return item ? [{ item, quantity: line.quantity }] : []
    })
  })

  const units = computed(() =>
    orderUnits(priced.value.map(({ item, quantity }) => ({ quantity, capacityWeight: item.capacityWeight })))
  )
  const totalPesewas = computed(() =>
    orderTotalPesewas(priced.value.map(({ item, quantity }) => ({ quantity, unitPricePesewas: item.pricePesewas })))
  )

  return { cart, priced, units, totalPesewas, attachToDrop, switchDrop, quantityOf, setQuantity, clear }
}
