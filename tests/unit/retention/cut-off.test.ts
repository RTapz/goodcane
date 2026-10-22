// BR-DP1: the moment before which a customer counts as inactive. Pure.
import { describe, expect, it } from 'vitest'
import { inactiveCutOff } from '../../../server/domain/retention'

describe('inactiveCutOff', () => {
  it('is the same time, the retention number of months earlier', () => {
    expect(inactiveCutOff(new Date('2026-10-22T12:00:00Z'), 6)).toEqual(new Date('2026-04-22T12:00:00Z'))
  })

  it('crosses a year boundary', () => {
    expect(inactiveCutOff(new Date('2026-03-15T08:00:00Z'), 6)).toEqual(new Date('2025-09-15T08:00:00Z'))
  })

  it('clamps to the last day of a shorter month', () => {
    expect(inactiveCutOff(new Date('2026-08-31T12:00:00Z'), 6)).toEqual(new Date('2026-02-28T12:00:00Z'))
  })
})
