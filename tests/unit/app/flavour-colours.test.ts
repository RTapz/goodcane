import { describe, expect, it } from 'vitest'
import { flavourColour, flavourColours } from '../../../app/utils/flavour-colours'
import { flavours } from '../../../server/db/seed/menu'

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const STUDIO = '#FBF8F0'

describe('flavourColour', () => {
  it('gives every sample menu flavour its own colour', () => {
    const colours = flavours.map((f) => flavourColours[f.name])
    expect(colours.every((c) => typeof c === 'string')).toBe(true)
    expect(new Set(colours).size).toBe(flavours.length)
  })

  // Bottles stand on the cream studio disc (--color-studio in main.css, spec 6.4).
  it.each(Object.entries(flavourColours))('%s (%s) is at least 3:1 against the studio disc', (_name, colour) => {
    expect(contrast(colour, STUDIO)).toBeGreaterThanOrEqual(3)
  })

  it('falls back to a neutral grey, also at least 3:1, for an unknown flavour', () => {
    expect(flavourColour('Mystery cane')).toBe('#78716C')
    expect(contrast(flavourColour('Mystery cane'), STUDIO)).toBeGreaterThanOrEqual(3)
  })
})
