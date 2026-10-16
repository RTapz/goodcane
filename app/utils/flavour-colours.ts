// Decorative accent colour per flavour. Display only: the flavour name is always shown too,
// so colour is never the only cue. Not GoodCane's artwork, just a colour per flavour.

const FALLBACK_COLOUR = '#A8A29E'

export const flavourColours: Record<string, string> = {
  'Raw cane': '#A9C76B',
  'Lemon-mint cane': '#2E8B4A',
  'Ginger-lemon cane': '#C8643B',
  'Tigernut-coconut cane': '#8C8C8C',
  'Passionfruit cane': '#5B3A9B',
  'Lemon-charcoal cane': '#3A3F44',
  'Cucumber cane': '#3FA79B',
  'Passionlemon cane': '#E0A526'
}

/** The accent colour for a flavour, or a neutral grey for one without its own colour. */
export function flavourColour(name: string): string {
  return flavourColours[name] ?? FALLBACK_COLOUR
}
