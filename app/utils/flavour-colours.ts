// Decorative accent colour per flavour. Display only: the flavour name is always shown too,
// so colour is never the only cue. Not GoodCane's artwork, just a colour per flavour.
// Every accent is at least 3:1 against the white card (WCAG 1.4.11 non-text contrast).

const FALLBACK_COLOUR = '#78716C'

export const flavourColours: Record<string, string> = {
  'Raw cane': '#7A9A3A',
  'Lemon-mint cane': '#2E8B4A',
  'Ginger-lemon cane': '#C8643B',
  'Tigernut-coconut cane': '#8C8C8C',
  'Passionfruit cane': '#5B3A9B',
  'Lemon-charcoal cane': '#3A3F44',
  'Cucumber cane': '#3C9E92',
  'Passionlemon cane': '#B9861A'
}

/** The accent colour for a flavour, or a neutral grey for one without its own colour. */
export function flavourColour(name: string): string {
  return flavourColours[name] ?? FALLBACK_COLOUR
}
