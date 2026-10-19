import { describe, expect, it } from 'vitest'
import { canOptIn, canOptOut, consentState } from '../../../server/domain/reminders/consent'

describe('consentState (BR-R2, BR-R8)', () => {
  it('reads the state from the latest consent row', () => {
    expect(consentState(null)).toBe('none_yet')
    expect(consentState({ action: 'opt_in', channel: 'whatsapp' })).toBe('opted_in')
    expect(consentState({ action: 'opt_out', channel: 'none' })).toBe('declined')
    expect(consentState({ action: 'opt_out', channel: null })).toBe('stopped')
  })
})

describe('canOptIn (BR-R8)', () => {
  it('allows opting in with no choice yet, or after choosing None', () => {
    expect(canOptIn('none_yet')).toBe(true)
    expect(canOptIn('declined')).toBe(true)
  })

  it('refuses after Stop reminders (only C9 may resubscribe), and when already opted in', () => {
    expect(canOptIn('stopped')).toBe(false)
    expect(canOptIn('opted_in')).toBe(false)
  })

  it('lets only C9 resubscribe after Stop reminders, as a fresh opt-in', () => {
    expect(canOptIn('stopped', 'c9')).toBe(true)
    expect(canOptIn('stopped', 'c6')).toBe(false)
    expect(canOptIn('stopped', 'c7')).toBe(false)
    expect(canOptIn('opted_in', 'c9')).toBe(false)
    expect(canOptIn('none_yet', 'c9')).toBe(true)
  })
})

describe('canOptOut', () => {
  it('None is a first choice only', () => {
    expect(canOptOut('none_yet', 'none')).toBe(true)
    expect(canOptOut('declined', 'none')).toBe(false)
    expect(canOptOut('opted_in', 'none')).toBe(false)
  })

  it('Stop is only for someone who is opted in', () => {
    expect(canOptOut('opted_in', 'stop')).toBe(true)
    expect(canOptOut('none_yet', 'stop')).toBe(false)
    expect(canOptOut('stopped', 'stop')).toBe(false)
  })
})
