export interface FreshLink {
  orderId: string
  privateLink: string
  whatsappUrl: string | null
}

/**
 * The private link, held in memory only, so C6 can show it once (BR-L4).
 * Never written to browser storage: it works like a key.
 */
export function useFreshLink() {
  return useState<FreshLink | null>('fresh-link', () => null)
}
