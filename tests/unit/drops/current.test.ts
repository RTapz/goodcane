import { describe, expect, it } from 'vitest'
import { pickNextDrop } from '../../../server/domain/drops'

const now = new Date('2026-10-16T12:00:00Z')
const drop = (id: string, dropAt: string, cutOffAt: string) => ({
  id,
  dropAt: new Date(dropAt),
  cutOffAt: new Date(cutOffAt)
})

const tuesday = drop('tue', '2026-10-20T12:00:00Z', '2026-10-17T12:00:00Z')
const friday = drop('fri', '2026-10-23T12:00:00Z', '2026-10-20T12:00:00Z')
const pastCutOff = drop('past', '2026-10-17T12:00:00Z', '2026-10-14T12:00:00Z')

describe('pickNextDrop (BR-D3, BR-D4)', () => {
  it('picks the earliest drop whose cut-off is still ahead, and the one after it', () => {
    const choice = pickNextDrop([friday, tuesday], now)
    expect(choice.drop?.id).toBe('tue')
    expect(choice.nextDrop?.id).toBe('fri')
    expect(choice.closed).toBe(false)
    expect(choice.missedDrop).toBeNull()
  })

  it('reports an open drop whose cut-off has passed as missed, and offers the next', () => {
    const choice = pickNextDrop([pastCutOff, tuesday], now)
    expect(choice.closed).toBe(true)
    expect(choice.missedDrop?.id).toBe('past')
    expect(choice.drop?.id).toBe('tue')
  })

  it('treats a cut-off exactly now as closed', () => {
    const closingNow = drop('now', '2026-10-19T12:00:00Z', '2026-10-16T12:00:00Z')
    expect(pickNextDrop([closingNow], now)).toMatchObject({ drop: null, closed: true })
  })

  it('returns no drop when nothing is scheduled', () => {
    expect(pickNextDrop([], now)).toEqual({ drop: null, nextDrop: null, missedDrop: null, closed: false })
  })
})
