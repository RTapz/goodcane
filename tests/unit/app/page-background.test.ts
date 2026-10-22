// The page background is CSS only (spec 6.4): no image, and text keeps WCAG AA contrast on the
// lightest part of the gradient.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../../', import.meta.url)
const css = readFileSync(new URL('app/assets/css/main.css', root), 'utf8')

type Rgb = [number, number, number]
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
const blend = (base: Rgb, top: Rgb, alpha: number): Rgb => base.map((c, i) => c + (top[i]! - c) * alpha) as Rgb
function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('page background (spec 6.4)', () => {
  it('uses no image anywhere in the stylesheet (only the self-hosted font), and the photo folder is gone', () => {
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]!)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => /\.woff2['"]?$/.test(u.trim()))).toBe(true)
    expect(existsSync(new URL('public/backgrounds', root))).toBe(false)
  })

  it('is the documented gradient: a lighter glow at the top and a faint cream wash at the foot', () => {
    expect(css).toContain('radial-gradient(120% 60% at 50% 0%, #1f3527 0%, transparent 60%)')
    expect(css).toContain('linear-gradient(to bottom, transparent 55%, rgb(244 236 216 / 0.07) 100%)')
  })

  it('keeps body text at WCAG AA (4.5:1) on the lightest points of the gradient', () => {
    const ink = hex('#f2ede0')
    const muted = hex('#c4cdbf') // --color-ink-muted
    const glow = hex('#1f3527')
    const foot = blend(hex('#121d16'), [244, 236, 216], 0.07)
    for (const background of [glow, foot]) {
      expect(contrast(ink, background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(muted, background)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
