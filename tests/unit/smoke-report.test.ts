// pnpm smoke's summary and sold-out explanation (spec section 9).
import { describe, expect, it } from 'vitest'
import { soldOutMessage, summarise, type StepResult } from '../../scripts/smoke-report'

const pass = (name: string): StepResult => ({ name, status: 'pass', required: true })

describe('summarise', () => {
  it('passes when every step passed', () => {
    const s = summarise([pass('a'), pass('b')])
    expect(s).toMatchObject({ passed: 2, failed: 0, skipped: 0, ok: true })
    expect(s.line).toBe('2 passed, 0 failed, 0 skipped (0 required)')
  })

  it('fails when a required step was skipped, even with no failures', () => {
    const s = summarise([pass('a'), { name: 'b', status: 'skip', required: true }])
    expect(s.ok).toBe(false)
    expect(s.requiredSkipped).toEqual(['b'])
    expect(s.line).toBe('1 passed, 0 failed, 1 skipped (1 required)')
  })

  it('passes when only optional steps were skipped', () => {
    const s = summarise([pass('a'), { name: 'clean up', status: 'skip', required: false }])
    expect(s.ok).toBe(true)
    expect(s.line).toBe('1 passed, 0 failed, 1 skipped (0 required)')
  })

  it('fails on any failure', () => {
    expect(summarise([pass('a'), { name: 'b', status: 'fail', required: false }]).ok).toBe(false)
  })
})

describe('soldOutMessage', () => {
  const facts = { dropAt: '2026-10-24T14:00:00.000Z', capacity: 70, spacesLeft: 0, nextDropSpaces: 60 }

  it('names capacity, paid units and holds when the owner view was read', () => {
    expect(soldOutMessage({ ...facts, paidUnits: 68, heldUnits: 2 })).toBe(
      'every item is sold out: drop Sat 24 Oct has capacity 70, 68 paid units, 2 units in active holds, 0 spaces left (next drop: 60 spaces). Reseed to reset the sample drops (README, Deployment step 4).'
    )
  })

  it('says how to see paid units and holds without the passcode', () => {
    const message = soldOutMessage({ ...facts, nextDropSpaces: null })
    expect(message).toContain('(set OWNER_PASSCODE to see paid units and holds)')
    expect(message).toContain('(no drop after it)')
  })
})
