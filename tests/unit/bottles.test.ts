// Every flavour on the sample menu has both bottle images (spec 6.4).
import { existsSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { flavours } from '../../server/db/seed/menu'

const root = new URL('../../public/bottles/', import.meta.url)

describe('flavour bottle images', () => {
  it.each(flavours.map((f) => f.name))('%s has a small and a large WebP, each under 20 KB', (name) => {
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    for (const size of ['sm', 'lg']) {
      const file = new URL(`${slug}-${size}.webp`, root)
      expect(existsSync(file), `${slug}-${size}.webp`).toBe(true)
      expect(statSync(file).size).toBeLessThan(20 * 1024)
    }
  })
})
