// Links the customer keeps or shares. Pure.

/** The private link (BR-L1): `{appUrl}/c/{token}`. */
export function privateLinkUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/c/${token}`
}

/**
 * A wa.me chat with prefilled text. In demo mode the only number allowed is
 * DEMO_WHATSAPP_NUMBER (constraint 3), so callers pass that and nothing else.
 * Returns null when no demo number is set, so the button can be hidden.
 */
export function whatsappShareUrl(demoNumber: string, text: string): string | null {
  const digits = demoNumber.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
