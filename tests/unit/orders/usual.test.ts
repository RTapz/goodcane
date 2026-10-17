import { describe, expect, it } from 'vitest'
import {
  buildUsualOrder,
  findSubstitute,
  type LastLine,
  type MenuOption
} from '../../../server/domain/orders/usual'

const item = (id: string, name: string, size: string, overrides: Partial<MenuOption> = {}): MenuOption => ({
  id,
  name,
  tasteGroup: 'sweet',
  size,
  pricePesewas: size === '330ml' ? 3500 : 4500,
  capacityWeight: 1,
  isSpecial: false,
  available: true,
  ...overrides
})

const raw330 = item('raw-330', 'Raw cane', '330ml')
const raw500 = item('raw-500', 'Raw cane', '500ml')
const passion330 = item('passion-330', 'Passionfruit cane', '330ml')
const passion500 = item('passion-500', 'Passionfruit cane', '500ml')
const tigernut330 = item('tiger-330', 'Tigernut-coconut cane', '330ml', { isSpecial: true })
const ginger330 = item('ginger-330', 'Ginger-lemon cane', '330ml', { tasteGroup: 'spicy' })
const menu = [raw330, raw500, passion330, passion500, tigernut330, ginger330]

const last = (m: MenuOption, quantity: number, paid = m.pricePesewas): LastLine => ({
  menuItemId: m.id,
  name: m.name,
  tasteGroup: m.tasteGroup,
  size: m.size,
  quantity,
  unitPricePesewas: paid
})

describe('buildUsualOrder (spec 6.3)', () => {
  it('ok: the same items at the same prices, fitting the spaces', () => {
    const usual = buildUsualOrder([last(raw330, 2), last(passion500, 1)], menu, 10)
    expect(usual.lines.map((l) => l.status)).toEqual(['ok', 'ok'])
    expect(usual).toMatchObject({ fits: true, units: 3, totalPesewas: 2 * 3500 + 4500 })
  })

  it('price_changed: shows the old and the new price', () => {
    const usual = buildUsualOrder([last(raw330, 1, 3000)], menu, 10)
    expect(usual.lines[0]).toMatchObject({ status: 'price_changed', price: { oldPesewas: 3000, newPesewas: 3500 } })
    expect(usual.totalPesewas).toBe(3500)
  })

  it('substituted: offers the nearest item but does not count it until accepted', () => {
    const gone = [{ ...raw330, available: false }, raw500, passion330, passion500, tigernut330, ginger330]
    const offered = buildUsualOrder([last(raw330, 2)], gone, 10)
    expect(offered.lines[0]).toMatchObject({ status: 'substituted', accepted: false, item: null })
    expect(offered.lines[0]!.substitute?.id).toBe('passion-330')
    expect(offered).toMatchObject({ fits: false, units: 0, totalPesewas: 0 })

    const accepted = buildUsualOrder([last(raw330, 2)], gone, 10, { acceptedSubstitutes: { 'raw-330': true } })
    expect(accepted.lines[0]).toMatchObject({ status: 'substituted', accepted: true })
    expect(accepted.lines[0]!.item?.id).toBe('passion-330')
    expect(accepted).toMatchObject({ fits: true, units: 2, totalPesewas: 7000 })
  })

  it('unavailable: nothing suitable in the same taste group', () => {
    const usual = buildUsualOrder([last(ginger330, 1)], [raw330, { ...ginger330, available: false }], 10)
    expect(usual.lines[0]).toMatchObject({ status: 'unavailable', item: null, substitute: null })
    expect(usual.fits).toBe(false)
  })

  it('too_big_for_space: suggests a capped quantity and never applies it', () => {
    const usual = buildUsualOrder([last(raw330, 5)], menu, 3)
    expect(usual.lines[0]).toMatchObject({ status: 'too_big_for_space', quantity: 5, cappedQuantity: 3 })
    expect(usual).toMatchObject({ fits: false, units: 5, totalPesewas: 5 * 3500 })
  })

  it('allocates spaces line by line, so only the line that overflows is capped', () => {
    const usual = buildUsualOrder([last(raw330, 2), last(passion500, 3)], menu, 4)
    expect(usual.lines.map((l) => [l.status, l.cappedQuantity])).toEqual([
      ['ok', null],
      ['too_big_for_space', 2]
    ])
  })

  it('keeps the price change visible on a line that is also too big', () => {
    const usual = buildUsualOrder([last(raw330, 5, 3000)], menu, 3)
    expect(usual.lines[0]).toMatchObject({ status: 'too_big_for_space', price: { oldPesewas: 3000, newPesewas: 3500 } })
  })

  it('takes inline quantity changes into account', () => {
    const usual = buildUsualOrder([last(raw330, 5)], menu, 3, { quantities: { 'raw-330': 3 } })
    expect(usual.lines[0]).toMatchObject({ status: 'ok', quantity: 3 })
    expect(usual.fits).toBe(true)
  })

  it('an empty menu leaves every line unavailable and nothing fits', () => {
    const usual = buildUsualOrder([last(raw330, 1), last(ginger330, 1)], [], 10)
    expect(usual.lines.map((l) => l.status)).toEqual(['unavailable', 'unavailable'])
    expect(usual).toMatchObject({ fits: false, units: 0, totalPesewas: 0 })
  })

  it('no previous lines: nothing to order', () => {
    expect(buildUsualOrder([], menu, 10)).toEqual({ lines: [], fits: false, units: 0, totalPesewas: 0 })
  })
})

describe('findSubstitute: substitution order', () => {
  it('prefers the same size, a non-special flavour over a drop special', () => {
    const options = [raw500, passion330, tigernut330]
    expect(findSubstitute(last(raw330, 1), options)?.id).toBe('passion-330')
  })

  it('uses a drop special in the same size before going to another size', () => {
    expect(findSubstitute(last(raw330, 1), [raw500, tigernut330])?.id).toBe('tiger-330')
  })

  it('falls back to the other size, the same flavour first', () => {
    expect(findSubstitute(last(raw330, 1), [passion500, raw500])?.id).toBe('raw-500')
  })

  it('never crosses taste groups or offers an unavailable item', () => {
    expect(findSubstitute(last(raw330, 1), [ginger330, { ...passion330, available: false }])).toBeNull()
  })
})
