// When a reminder is due (BR-R4) and whether the customer's frequency allows one for this drop. Pure.
import { describe, expect, it } from 'vitest'
import { frequencyAllows, reminderDueAt, reminderWindow } from '../../../server/domain/reminders/due'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const cutOffAt = new Date('2026-10-24T14:00:00Z')
const dueAt = reminderDueAt(cutOffAt, 2)

describe('reminderDueAt and reminderWindow (BR-R4)', () => {
  it('is due a set number of days before cut-off', () => {
    expect(dueAt).toEqual(new Date('2026-10-22T14:00:00Z'))
  })

  it('is coming up before the due time, due now until cut-off, then closed', () => {
    expect(reminderWindow(new Date(dueAt.getTime() - 1), dueAt, cutOffAt)).toBe('coming_up')
    expect(reminderWindow(dueAt, dueAt, cutOffAt)).toBe('due_now')
    expect(reminderWindow(new Date(cutOffAt.getTime() - 1), dueAt, cutOffAt)).toBe('due_now')
    expect(reminderWindow(cutOffAt, dueAt, cutOffAt)).toBe('closed')
  })
})

describe('frequencyAllows', () => {
  const thisDrop = { index: 10, dueAt }

  it('every drop: always', () => {
    expect(frequencyAllows('every_drop', thisDrop, { dropIndex: 9, sentAt: new Date(dueAt.getTime() - 3 * DAY) })).toBe(true)
    expect(frequencyAllows('every_drop', thisDrop, null)).toBe(true)
  })

  it('every second drop: not when the drop just before was reminded', () => {
    expect(frequencyAllows('every_second_drop', thisDrop, null)).toBe(true)
    expect(frequencyAllows('every_second_drop', thisDrop, { dropIndex: 9, sentAt: new Date(dueAt.getTime() - 3 * DAY) })).toBe(false)
    expect(frequencyAllows('every_second_drop', thisDrop, { dropIndex: 8, sentAt: new Date(dueAt.getTime() - 7 * DAY) })).toBe(true)
  })

  it('monthly: not when a reminder went out in the 28 days before this due time', () => {
    expect(frequencyAllows('monthly', thisDrop, null)).toBe(true)
    expect(frequencyAllows('monthly', thisDrop, { dropIndex: 2, sentAt: new Date(dueAt.getTime() - 27 * DAY) })).toBe(false)
    expect(frequencyAllows('monthly', thisDrop, { dropIndex: 2, sentAt: new Date(dueAt.getTime() - 28 * DAY) })).toBe(true)
  })
})
