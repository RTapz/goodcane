/** A message shown on C2 when the server turns an order down (BR-F1: the customer decides what next). */
export function useOrderNotice() {
  const notice = useState<string | null>('order-notice', () => null)
  return {
    notice,
    setNotice: (message: string) => {
      notice.value = message
    },
    clearNotice: () => {
      notice.value = null
    }
  }
}
