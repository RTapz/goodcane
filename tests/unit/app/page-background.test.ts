// The page background (spec 6.4): one small cane photo under a dark green wash, and text keeps
// WCAG AA contrast even where the photo is at its brightest.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../../', import.meta.url)
const css = readFileSync(new URL('app/assets/css/main.css', root), 'utf8')
const BACKGROUND = 'public/backgrounds/cane.webp'

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
  it('uses only the font and the one cane photo as images, and the old sugarcane photo is gone', () => {
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]!.trim().replace(/['"]/g, ''))
    expect(urls.filter((u) => !u.endsWith('.woff2'))).toEqual(['/backgrounds/cane.webp'])
    expect(existsSync(new URL('public/backgrounds/sugarcane.jpg', root))).toBe(false)
  })

  it('is one small WebP', () => {
    expect(existsSync(new URL(BACKGROUND, root))).toBe(true)
    expect(statSync(new URL(BACKGROUND, root)).size).toBeLessThan(60 * 1024)
  })

  it('sits under the documented dark green wash', () => {
    expect(css).toContain("linear-gradient(rgb(18 29 22 / 0.82), rgb(18 29 22 / 0.9)), url('/backgrounds/cane.webp')")
  })

  it('keeps body and muted text at WCAG AA even over a pure white pixel under the lightest part of the wash', () => {
    const worst = blend([255, 255, 255], hex('#121d16'), 0.82)
    expect(contrast(hex('#f2ede0'), worst)).toBeGreaterThanOrEqual(4.5) // --color-ink
    expect(contrast(hex('#c4cdbf'), worst)).toBeGreaterThanOrEqual(4.5) // --color-ink-muted
  })
})
