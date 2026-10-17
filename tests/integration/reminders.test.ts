// Reminder opt-in and opt-out against the real *_test database (BR-R1, BR-R2, BR-R8).
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../server/db/client'
import { consentEvents, customers } from '../../server/db/schema'
import { optIn, optOut } from '../../server/services/reminders'
import { resetTestDatabase } from '../support/reset-test-db'
import { testDatabaseUrl } from '../support/test-db'
import { HOUR, makeDrop, makeItem, MIN, requestedOrder } from './fixtures'

const { db, client } = createDb(testDatabaseUrl())
afterAll(async () => {
  await resetTestDatabase(client)
  await client.end()
})

const now = new Date('2026-10-17T12:00:00Z')
const at = (n: number) => ({ now: new Date(now.getTime() + n * MIN), demoMode: true })
let customerId: string

beforeEach(async () => {
  await resetTestDatabase(client)
  const dropId = await makeDrop(db, 10, new Date(now.getTime() + 48 * HOUR))
  const itemId = await makeItem(db)
  customerId = (await requestedOrder(db, dropId, itemId, 1, now)).customerId
})

const rows = () => db.select().from(consentEvents).where(eq(consentEvents.customerId, customerId)).orderBy(asc(consentEvents.createdAt))
const customer = async () => (await db.select().from(customers).where(eq(customers.id, customerId)))[0]!

describe('consent is append-only (BR-R2)', () => {
  it('opt-in writes one opt_in row and updates the customer', async () => {
    expect(await optIn(db, customerId, { channel: 'whatsapp', frequency: 'every_drop', source: 'c6' }, at(1))).toEqual({
      kind: 'ok',
      state: 'opted_in'
    })
    expect(await rows()).toMatchObject([{ action: 'opt_in', channel: 'whatsapp', frequency: 'every_drop', source: 'c6', isSample: true }])
    expect(await customer()).toMatchObject({ reminderChannel: 'whatsapp', reminderFrequency: 'every_drop', lastActiveAt: at(1).now })
  })

  it('earlier rows are never updated or deleted: each change only adds a row', async () => {
    await optOut(db, customerId, { choice: 'none', source: 'c6' }, at(1))
    const before = await rows()
    await optIn(db, customerId, { channel: 'sms', frequency: 'monthly', source: 'c7' }, at(2))
    const middle = await rows()
    await optOut(db, customerId, { choice: 'stop', source: 'c7' }, at(3))
    const after = await rows()
    expect(middle.slice(0, before.length)).toEqual(before)
    expect(after.slice(0, middle.length)).toEqual(middle)
    expect(after.map((r) => `${r.action}:${r.channel}:${r.source}`)).toEqual(['opt_out:none:c6', 'opt_in:sms:c7', 'opt_out:null:c7'])
  })
})

describe('None and Stop (BR-R1, BR-R8)', () => {
  it('None writes opt_out with channel none, and the customer may opt in later', async () => {
    expect(await optOut(db, customerId, { choice: 'none', source: 'c6' }, at(1))).toEqual({ kind: 'ok', state: 'declined' })
    expect(await customer()).toMatchObject({ reminderChannel: 'none', reminderFrequency: null })
    expect((await optIn(db, customerId, { channel: 'whatsapp', frequency: 'every_drop', source: 'c7' }, at(2))).kind).toBe('ok')
  })

  it('after Stop reminders, opt-in is refused until C9 and nothing is written', async () => {
    await optIn(db, customerId, { channel: 'whatsapp', frequency: 'every_drop', source: 'c6' }, at(1))
    expect(await optOut(db, customerId, { choice: 'stop', source: 'c6' }, at(2))).toEqual({ kind: 'ok', state: 'stopped' })
    expect(await customer()).toMatchObject({ reminderChannel: null, reminderFrequency: null })
    const count = (await rows()).length
    expect(await optIn(db, customerId, { channel: 'sms', frequency: 'monthly', source: 'c7' }, at(3))).toEqual({
      kind: 'refused',
      state: 'stopped'
    })
    expect((await rows()).length).toBe(count)
  })

  it('refuses a second opt-in, Stop without an opt-in, and None after a choice', async () => {
    expect((await optOut(db, customerId, { choice: 'stop', source: 'c6' }, at(1))).kind).toBe('refused')
    await optIn(db, customerId, { channel: 'whatsapp', frequency: 'every_drop', source: 'c6' }, at(2))
    expect((await optIn(db, customerId, { channel: 'sms', frequency: 'monthly', source: 'c6' }, at(3))).kind).toBe('refused')
    expect((await optOut(db, customerId, { choice: 'none', source: 'c6' }, at(4))).kind).toBe('refused')
    expect((await rows()).length).toBe(1)
  })
})
