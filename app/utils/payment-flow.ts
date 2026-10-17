// The two steps around a successful payment, kept here so the order of operations is tested.
// Bug this guards against: C6 trusted a cached "requested" order, sent the customer back to C5,
// and the private link (held only in memory) was never shown.

export interface PaymentSuccess {
  privateLink: string | null
  whatsappUrl: string | null
}

export interface StoredLink {
  orderId: string
  privateLink: string
  whatsappUrl: string | null
}

/**
 * C5 after "Simulate success": store the link FIRST, refresh the cached order so it says paid,
 * and only then navigate to C6.
 */
export async function completeSuccessfulPayment(args: {
  orderId: string
  result: PaymentSuccess
  storeLink: (link: StoredLink | null) => void
  refreshOrder: () => Promise<unknown>
  navigate: (path: string) => Promise<unknown>
}): Promise<void> {
  const { orderId, result } = args
  args.storeLink(result.privateLink ? { orderId, privateLink: result.privateLink, whatsappUrl: result.whatsappUrl } : null)
  await args.refreshOrder()
  await args.navigate(`/confirmed/${orderId}`)
}

/**
 * C6 on open: send the customer back to pay only if the SERVER says the order is unpaid.
 * A cached copy saying "requested" is checked again before anyone is moved.
 */
export async function shouldReturnToPay(args: {
  isPaid: () => boolean
  refresh: () => Promise<unknown>
}): Promise<boolean> {
  if (args.isPaid()) return false
  await args.refresh()
  return !args.isPaid()
}
