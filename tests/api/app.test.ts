// API tests: builds the app once, starts it against the seeded *_test database and calls it over HTTP.
// Run with `pnpm test:api`.
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { fitsInDrop } from '../../server/domain/capacity'
import { nextDropResponse } from '../../server/schemas/drops'
import { rootDir, testDatabaseUrl } from '../support/test-db'

const url = testDatabaseUrl()
// The built server must use the test database, never the dev one.
process.env.DATABASE_URL = url
process.env.NUXT_DATABASE_URL = url
// A made-up demo number, so the test can check every wa.me link uses it and only it.
process.env.DEMO_WHATSAPP_NUMBER = '233200000000'

await setup({ rootDir, server: true, build: true })

const sql = postgres(url, { max: 1 })
afterAll(() => sql.end())

describe('GET /api/drops/next', () => {
  it('returns the next open drop with spaces left that match the database', async () => {
    const body = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const drop = body.drop
    expect(drop).not.toBeNull()
    if (!drop) return
    expect(Date.parse(drop.cutOffAt)).toBeGreaterThan(Date.parse(body.serverNow))

    // Worked out independently: capacity minus paid units minus active holds (BR-C2).
    const [row] = await sql<{ confirmed: number; held: number }[]>`
      select
        coalesce(sum(case when o."status" in ('paid_confirmed', 'fulfilled') then oi."quantity" * m."capacity_weight" else 0 end), 0)::int as "confirmed",
        coalesce(sum(case when o."status" = 'requested' and o."hold_expires_at" > now() then oi."quantity" * m."capacity_weight" else 0 end), 0)::int as "held"
      from "orders" o
      join "order_items" oi on oi."order_id" = o."id"
      join "menu_items" m on m."id" = oi."menu_item_id"
      where o."drop_id" = ${drop.id}`
    expect(drop.spacesLeft).toBe(Math.max(0, drop.capacity - (row?.confirmed ?? 0) - (row?.held ?? 0)))
  })

  it('flags sold-out items, offers only main-flow sizes and lists the delivery areas', async () => {
    const body = nextDropResponse.parse(await $fetch('/api/drops/next'))
    expect(body.menu.length).toBeGreaterThan(0)
    for (const item of body.menu) {
      expect(['330ml', '500ml']).toContain(item.size)
      expect(item.soldOut).toBe(!fitsInDrop(item.capacityWeight, body.drop?.spacesLeft ?? 0))
    }
    expect(body.deliveryAreas.map((a) => a.id)).toEqual(['sample-area-a', 'sample-area-b'])
  })

  it('rejects unknown query parameters', async () => {
    const response = await fetch('/api/drops/next?surprise=1')
    expect(response.status).toBe(400)
  })
})

describe('POST /api/orders and GET /api/orders/:id', () => {
  async function placeOrder(cookie?: string, phone = '024 123 4567') {
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: next.menu[0]!.id, quantity: 1 }],
        firstName: 'Sample',
        phone,
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('gc_session='))
    return { response, setCookie, cookie: setCookie?.split(';')[0] }
  }

  it('creates an order and sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const { response, setCookie } = await placeOrder()
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ orderId: expect.any(String) })
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
  })

  it('(f) only the browser that placed the order can read it', async () => {
    const mine = await placeOrder()
    const { orderId } = (await mine.response.json()) as { orderId: string }
    const theirs = await placeOrder()

    const own = await fetch(`/api/orders/${orderId}`, { headers: { cookie: mine.cookie! } })
    expect(own.status).toBe(200)
    const summary = (await own.json()) as { phoneMasked: string; status: string }
    expect(summary.status).toBe('requested')
    expect(summary.phoneMasked).toMatch(/567$/)
    expect(JSON.stringify(summary)).not.toContain('241234567')

    expect((await fetch(`/api/orders/${orderId}`)).status).toBe(404)
    expect((await fetch(`/api/orders/${orderId}`, { headers: { cookie: theirs.cookie! } })).status).toBe(404)
  })

  it('rejects a phone number that is not a Ghana number, with an inline message', async () => {
    const { response } = await placeOrder(undefined, '12345')
    expect(response.status).toBe(400)
    const body = (await response.json()) as { data: { fieldErrors: { phone: string[] } } }
    expect(body.data.fieldErrors.phone[0]).toContain('Ghana mobile number')
  })
})

describe('payment flow over HTTP (C5, C6)', () => {
  async function newOrder() {
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: next.menu[0]!.id, quantity: 1 }],
        firstName: 'Sample',
        phone: '020 000 0009',
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    const { orderId } = (await response.json()) as { orderId: string }
    return { orderId, cookie }
  }
  const post = (path: string, cookie: string, body?: unknown) =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body)
    })

  it('pay-start then a simulated success confirms, and returns the private link once', async () => {
    const { orderId, cookie } = await newOrder()
    const held = await post(`/api/orders/${orderId}/pay-start`, cookie)
    expect(held.status).toBe(200)
    const paid = await post('/api/payments/simulate', cookie, { orderId, reference: `API-${crypto.randomUUID()}`, outcome: 'success' })
    const body = (await paid.json()) as { result: string; privateLink: string | null; whatsappUrl: string | null }
    expect(body.result).toBe('confirmed')
    expect(body.privateLink).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/)
    // Constraint 3: the only number in a wa.me link is DEMO_WHATSAPP_NUMBER.
    expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/233200000000\?text=/)
    expect(decodeURIComponent(body.whatsappUrl!.split('text=')[1]!)).toContain(body.privateLink!)

    const summary = (await (await fetch(`/api/orders/${orderId}`, { headers: { cookie } })).json()) as { status: string }
    expect(summary.status).toBe('paid_confirmed')
  })

  it('another browser cannot pay-start, pay or read the order', async () => {
    const mine = await newOrder()
    const theirs = await newOrder()
    expect((await post(`/api/orders/${mine.orderId}/pay-start`, theirs.cookie)).status).toBe(404)
    const pay = await post('/api/payments/simulate', theirs.cookie, {
      orderId: mine.orderId,
      reference: `API-${crypto.randomUUID()}`,
      outcome: 'success'
    })
    expect(pay.status).toBe(404)
    expect((await fetch(`/api/orders/${mine.orderId}`, { headers: { cookie: theirs.cookie } })).status).toBe(404)
  })

  it('opening the private link logs in, lands on C6 and leaks no referrer', async () => {
    const { orderId, cookie } = await newOrder()
    await post(`/api/orders/${orderId}/pay-start`, cookie)
    const paid = (await (
      await post('/api/payments/simulate', cookie, { orderId, reference: `API-${crypto.randomUUID()}`, outcome: 'success' })
    ).json()) as { privateLink: string }
    const path = new URL(paid.privateLink).pathname

    for (let i = 0; i < 2; i++) {
      // A fresh browser (no cookie) each time: the link works more than once (BR-L1).
      const opened = await fetch(path, { redirect: 'manual' })
      expect(opened.status).toBe(302)
      expect(opened.headers.get('location')).toBe(`/confirmed/${orderId}`)
      expect(opened.headers.get('referrer-policy')).toBe('no-referrer')
      const session = opened.headers.getSetCookie().find((c) => c.startsWith('gc_session='))
      expect(session).toMatch(/HttpOnly/i)
      const read = await fetch(`/api/orders/${orderId}`, { headers: { cookie: session!.split(';')[0]! } })
      expect(read.status).toBe(200)
    }
  })

  it('an invalid private link lands on the "no longer works" page', async () => {
    const opened = await fetch(`/c/${'x'.repeat(43)}`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    expect(opened.headers.get('location')).toBe('/link-invalid')
  })
})
