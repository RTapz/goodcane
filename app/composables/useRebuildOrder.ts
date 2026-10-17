import type { OrderSummary } from '~~/server/services/orders/get-order'

/** "Rebuild my order": puts an order's items back in the cart and returns to C2 (no dead end). */
export function useRebuildOrder() {
  const { attachToDrop, setQuantity, clear } = useCart()
  return async (order: OrderSummary) => {
    attachToDrop(order.drop.id)
    clear()
    for (const line of order.lines) setQuantity(line.menuItemId, line.quantity)
    await navigateTo('/order')
  }
}
