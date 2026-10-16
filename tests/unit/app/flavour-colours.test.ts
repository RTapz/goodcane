import { describe, expect, it } from 'vitest'
import { flavourColour, flavourColours } from '../../../app/utils/flavour-colours'
import { flavours } from '../../../server/db/seed/menu'

describe('flavourColour', () => {
  it('gives every sample menu flavour its own colour', () => {
    const colours = flavours.map((f) => flavourColours[f.name])
    expect(colours.every((c) => typeof c === 'string')).toBe(true)
    expect(new Set(colours).size).toBe(flavours.length)
  })

  it('falls back to neutral grey for an unknown flavour', () => {
    expect(flavourColour('Mystery cane')).toBe('#A8A29E')
  })
})
