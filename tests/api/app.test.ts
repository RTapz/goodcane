// API tests: builds the app once, starts it against the seeded *_test database and calls it over HTTP.
// Run with `pnpm test:api`.
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { fitsInDrop } from '../../server/domain/capacity'
import { DEMO_CUSTOMER_NAME, DEMO_CUSTOMER_PHONE, DEMO_CUSTOMER_TOKEN } from '../../server/domain/identity/demo-customer'
import { nextDropResponse } from '../../server/schemas/drops'
import { rootDir, testDatabaseUrl } from '../support/test-db'

const url = testDatabaseUrl()
// The built server must use the test database, never the dev one.
process.env.DATABASE_URL = url
process.env.NUXT_DATABASE_URL = url
// A made-up demo number, so the test can check every wa.me link uses it and only it.
process.env.DEMO_WHATSAPP_NUMBER = '233200000000'
// A made-up public base, so the test can prove private links are built from it and not from the request host.
const appUrl = 'https://goodcane.test'
process.env.NUXT_PUBLIC_APP_URL = appUrl
// A passcode made up for this run only, so no real one is ever needed or committed.
const ownerPasscode = crypto.randomUUID()
process.env.NUXT_OWNER_PASSCODE = ownerPasscode

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

  it('opening the private link logs in, lands a returning customer on C7 and leaks no referrer', async () => {
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
      expect(opened.headers.get('location')).toBe('/same-again')
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

describe('private link end to end: C6 link to C7 (BR-L3, BR-L4)', () => {
  /** Orders, pays and returns the link exactly as C6 shows it, with the paying browser's cookie. */
  async function paidWithLink() {
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const item = next.menu.find((m) => !m.soldOut)!
    const created = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: item.id, quantity: 1 }],
        firstName: 'Linktest',
        phone: '020 000 0077',
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const cookie = created.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    const { orderId } = (await created.json()) as { orderId: string }
    const json = { 'content-type': 'application/json', cookie }
    await fetch(`/api/orders/${orderId}/pay-start`, { method: 'POST', headers: { cookie } })
    const paid = (await (
      await fetch('/api/payments/simulate', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ orderId, reference: `API-${crypto.randomUUID()}`, outcome: 'success' })
      })
    ).json()) as { result: string; privateLink: string }
    expect(paid.result).toBe('confirmed')
    return { orderId, cookie, item, privateLink: paid.privateLink }
  }

  /** Opens a path with no cookies, as a new browser would, and returns the redirect and session. */
  async function openFresh(path: string) {
    const opened = await fetch(path, { redirect: 'manual' })
    const setCookie = opened.headers.getSetCookie().find((c) => c.startsWith('gc_session='))
    return { status: opened.status, location: opened.headers.get('location'), setCookie, cookie: setCookie?.split(';')[0] }
  }

  it('builds the link from NUXT_PUBLIC_APP_URL, never the request host', async () => {
    const { privateLink } = await paidWithLink()
    expect(privateLink).toMatch(new RegExp(`^${appUrl.replace(/\./g, '\\.')}/c/[A-Za-z0-9_-]{43}$`))
  })

  it('with no cookies: sets a secure session cookie and lands on C7 with the usual order', async () => {
    const { privateLink, item } = await paidWithLink()
    const opened = await openFresh(new URL(privateLink).pathname)
    expect(opened.status).toBe(302)
    expect(opened.location).toBe('/same-again')
    expect(opened.setCookie).toMatch(/HttpOnly/i)
    expect(opened.setCookie).toMatch(/SameSite=Lax/i)
    expect(opened.setCookie).toMatch(/Path=\//i)
    expect(opened.setCookie).toMatch(/Secure/i)

    // Follow the redirect with that cookie: C7 renders, it does not bounce to C1.
    const page = await fetch('/same-again', { headers: { cookie: opened.cookie! }, redirect: 'manual' })
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('Same again, Linktest?')
    expect(html).toContain(`${item.name} ${item.size}`)

    // Control: without the cookie the same page sends the visitor to C1, so the check above can fail.
    const anonymous = await fetch('/same-again', { redirect: 'manual' })
    expect(anonymous.status).toBe(302)
    expect(anonymous.headers.get('location')).toBe('/')
  })

  it('a token with one character changed gives the "link invalid" page', async () => {
    const { privateLink } = await paidWithLink()
    const path = new URL(privateLink).pathname
    const last = path.at(-1)!
    const changed = path.slice(0, -1) + (last === 'A' ? 'B' : 'A')
    const opened = await openFresh(changed)
    expect(opened.status).toBe(302)
    expect(opened.location).toBe('/link-invalid')
    expect(opened.setCookie).toBeUndefined()
  })

  it('a second browser can use the same link, and it still works after the first cookie is gone', async () => {
    const { privateLink, orderId, cookie: payingCookie } = await paidWithLink()
    const path = new URL(privateLink).pathname
    const first = await openFresh(path)
    const second = await openFresh(path)
    expect(first.location).toBe('/same-again')
    expect(second.location).toBe('/same-again')
    expect(second.cookie).not.toBe(first.cookie)
    // Each session reads the order on its own.
    for (const c of [first.cookie!, second.cookie!]) {
      expect((await fetch(`/api/orders/${orderId}`, { headers: { cookie: c } })).status).toBe(200)
    }
    // The paying browser clears its cookie: the link alone still gets the customer back in.
    expect(payingCookie).not.toBe(first.cookie)
    const again = await openFresh(path)
    expect(again.location).toBe('/same-again')
    expect((await fetch(`/api/orders/${orderId}`, { headers: { cookie: again.cookie! } })).status).toBe(200)
  })
})

describe('returning customer: /api/me, reminders and the C7 two-step reorder', () => {
  async function paidCustomer() {
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const item = next.menu[0]!
    const created = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: item.id, quantity: 2 }],
        firstName: 'Sample',
        phone: '020 000 0010',
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const cookie = created.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    const { orderId } = (await created.json()) as { orderId: string }
    const headers = { 'content-type': 'application/json', cookie }
    await fetch(`/api/orders/${orderId}/pay-start`, { method: 'POST', headers })
    await fetch('/api/payments/simulate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, reference: `API-${crypto.randomUUID()}`, outcome: 'success' })
    })
    return { cookie, headers, next, item }
  }

  it('/api/me answers only with a session, and only with that customer\'s data', async () => {
    expect((await fetch('/api/me')).status).toBe(404)
    const a = await paidCustomer()
    const me = (await (await fetch('/api/me', { headers: { cookie: a.cookie } })).json()) as {
      phoneMasked: string
      lastOrder: { lines: { quantity: number }[] }
    }
    expect(me.phoneMasked).toMatch(/010$/)
    expect(me.lastOrder.lines[0]!.quantity).toBe(2)
    expect(JSON.stringify(me)).not.toContain('0000010')
  })

  it('opt-in then Stop reminders; opting in again is refused (BR-R8)', async () => {
    const a = await paidCustomer()
    const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: a.headers, body: JSON.stringify(body) })
    expect((await post('/api/reminders/optin', { channel: 'whatsapp', frequency: 'every_drop', source: 'c6' })).status).toBe(200)
    expect((await post('/api/reminders/optout', { choice: 'stop', source: 'c6' })).status).toBe(200)
    expect((await post('/api/reminders/optin', { channel: 'sms', frequency: 'monthly', source: 'c7' })).status).toBe(409)
  })

  it('two steps: open C7 (its data), press Pay, and a requested order exists with server-side prices', async () => {
    const a = await paidCustomer()
    // Step 1: what C7 loads on opening, with no typing.
    const me = (await (await fetch('/api/me', { headers: { cookie: a.cookie } })).json()) as {
      lastOrder: { lines: { menuItemId: string; quantity: number }[] }
    }
    const lines = me.lastOrder.lines.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
    const expectedTotalPesewas = 2 * a.item.pricePesewas
    // Step 2: Pay.
    const placed = await fetch('/api/orders', {
      method: 'POST',
      headers: a.headers,
      body: JSON.stringify({
        reorder: true,
        dropId: a.next.drop!.id,
        lines,
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID(),
        expectedTotalPesewas
      })
    })
    expect(placed.status).toBe(201)
    const { orderId } = (await placed.json()) as { orderId: string }
    const summary = (await (await fetch(`/api/orders/${orderId}`, { headers: { cookie: a.cookie } })).json()) as {
      status: string
      totalPesewas: number
      lines: { menuItemId: string; quantity: number; unitPricePesewas: number }[]
    }
    expect(summary.status).toBe('requested')
    expect(summary.lines).toMatchObject([{ menuItemId: a.item.id, quantity: 2, unitPricePesewas: a.item.pricePesewas }])
    expect(summary.totalPesewas).toBe(expectedTotalPesewas)
  })

  it('regression: C7 never trusts client prices', async () => {
    const a = await paidCustomer()
    const reorder = (extra: Record<string, unknown>, lineExtra: Record<string, unknown> = {}) =>
      fetch('/api/orders', {
        method: 'POST',
        headers: a.headers,
        body: JSON.stringify({
          reorder: true,
          dropId: a.next.drop!.id,
          lines: [{ menuItemId: a.item.id, quantity: 1, ...lineExtra }],
          fulfilment: 'pickup',
          idempotencyKey: crypto.randomUUID(),
          expectedTotalPesewas: a.item.pricePesewas,
          ...extra
        })
      })
    // Price fields are rejected outright.
    expect((await reorder({}, { unitPricePesewas: 1 })).status).toBe(400)
    expect((await reorder({ totalPesewas: 1 })).status).toBe(400)
    // expectedTotalPesewas is only a guard: a wrong value is refused with the real total, nothing stored.
    const guarded = await reorder({ expectedTotalPesewas: 1 })
    expect(guarded.status).toBe(409)
    const body = (await guarded.json()) as { data: { reason: string; totalPesewas: number } }
    expect(body.data).toMatchObject({ reason: 'price_changed', totalPesewas: a.item.pricePesewas })
    // A reorder without a session is refused, so details can never come from someone else.
    const anonymous = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reorder: true,
        dropId: a.next.drop!.id,
        lines: [{ menuItemId: a.item.id, quantity: 1 }],
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID(),
        expectedTotalPesewas: a.item.pricePesewas
      })
    })
    expect(anonymous.status).toBe(404)
  })
})

describe('C0 About, C8 lost link and C9 Manage', () => {
  /** A customer who paid one order; returns the cookie and the private link. */
  async function paidWithSession(phone: string) {
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const item = next.menu.find((m) => !m.soldOut)!
    const created = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: item.id, quantity: 1 }],
        firstName: 'Managetest',
        phone,
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const cookie = created.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    const { orderId } = (await created.json()) as { orderId: string }
    const headers = { 'content-type': 'application/json', cookie }
    await fetch(`/api/orders/${orderId}/pay-start`, { method: 'POST', headers })
    const paid = (await (
      await fetch('/api/payments/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId, reference: `API-${crypto.randomUUID()}`, outcome: 'success' })
      })
    ).json()) as { privateLink: string }
    return { cookie, headers, orderId, item, linkPath: new URL(paid.privateLink).pathname }
  }

  it('Demo Customer A: the published link lands on C7 with the usual order, and no full phone anywhere', async () => {
    const opened = await fetch(`/c/${DEMO_CUSTOMER_TOKEN}`, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    expect(opened.headers.get('location')).toBe('/same-again')
    const cookie = opened.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    const page = await fetch('/same-again', { headers: { cookie }, redirect: 'manual' })
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain(`Same again, ${DEMO_CUSTOMER_NAME}?`)
    expect(html).toContain('Raw cane 330ml')
    const me = await (await fetch('/api/me', { headers: { cookie } })).text()
    for (const body of [html, me]) expect(body).not.toContain(DEMO_CUSTOMER_PHONE)
    // C0 publishes the link, built from NUXT_PUBLIC_APP_URL.
    const about = await $fetch<string>('/about')
    expect(about).toContain('Try as a returning customer')
    expect(about).toContain(`${appUrl}/c/${DEMO_CUSTOMER_TOKEN}`)
  })

  it('the background photo is gone: the file is 404 and no page asks for it (spec 6.4)', async () => {
    expect((await fetch('/backgrounds/sugarcane.jpg')).status).toBe(404)
    for (const path of ['/', '/about']) expect(await $fetch<string>(path), path).not.toContain('backgrounds/')
  })

  it('C0 renders for everyone, with the data protection sources', async () => {
    const html = await $fetch<string>('/about')
    expect(html).toContain('About this demo')
    expect(html).toContain('https://ghalii.org/akn/gh/act/2012/843')
    expect(html).toContain('https://dataprotection.org.gh')
    expect(html).not.toContain(String.fromCharCode(0x2014)) // no em dashes (style rule)
  })

  it('C8: the lost-link message asks for the first name, uses only the demo number and has no token', async () => {
    const help = (await $fetch('/api/lost-link')) as { text: string; whatsappUrl: string | null }
    expect(help.text).toMatch(/first name/i)
    expect(help.whatsappUrl).toMatch(/^https:\/\/wa\.me\/233200000000\?text=/)
    expect(help.text).not.toMatch(/\/c\//)
    const page = await $fetch<string>('/link-invalid')
    expect(page).toContain('Lost your link?')
  })

  it('C9 without a session: the page asks for the private link, and the data routes are 404', async () => {
    const html = await $fetch<string>('/manage')
    expect(html).toContain('Open your private link')
    expect(html).toContain('Lost your link?')
    expect((await fetch('/api/me/orders')).status).toBe(404)
    const del = await fetch('/api/me/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"confirm":true}' })
    expect(del.status).toBe(404)
    const resubscribe = await fetch('/api/reminders/optin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'sms', frequency: 'monthly', source: 'c9' })
    })
    expect(resubscribe.status).toBe(404)
  })

  it('C9 with a session: masked phone and own orders, never the full phone', async () => {
    const a = await paidWithSession('020 000 0031')
    const html = await (await fetch('/manage', { headers: { cookie: a.cookie } })).text()
    expect(html).toContain('Managetest')
    expect(html).toMatch(/031/)
    expect(html).not.toContain('0000031')
    const orders = (await (await fetch('/api/me/orders', { headers: { cookie: a.cookie } })).json()) as {
      orders: { id: string; status: string; lines: { name: string }[] }[]
    }
    expect(orders.orders.map((o) => o.id)).toEqual([a.orderId])
    expect(orders.orders[0]).toMatchObject({ status: 'paid_confirmed', lines: [{ name: a.item.name }] })
    expect(JSON.stringify(orders)).not.toMatch(/0000031|address/)
  })

  it('C9 resubscribe after Stop works only from C9', async () => {
    const a = await paidWithSession('020 000 0032')
    const post = (path: string, body: unknown) => fetch(path, { method: 'POST', headers: a.headers, body: JSON.stringify(body) })
    await post('/api/reminders/optin', { channel: 'whatsapp', frequency: 'every_drop', source: 'c6' })
    expect((await post('/api/reminders/optout', { choice: 'stop', source: 'c9' })).status).toBe(200)
    expect((await post('/api/reminders/optin', { channel: 'sms', frequency: 'monthly', source: 'c7' })).status).toBe(409)
    expect((await post('/api/reminders/optin', { channel: 'sms', frequency: 'monthly', source: 'c9' })).status).toBe(200)
  })

  it('C9 cancel: own order only, with confirm; a paid order gets refund due and frees its spaces', async () => {
    const a = await paidWithSession('020 000 0034')
    const cancel = (headers: Record<string, string>, body: string) =>
      fetch(`/api/orders/${a.orderId}/cancel`, { method: 'POST', headers, body })
    const listed = (await (await fetch('/api/me/orders', { headers: { cookie: a.cookie } })).json()) as {
      orders: { id: string; canCancel: boolean }[]
    }
    expect(listed.orders[0]).toMatchObject({ id: a.orderId, canCancel: true })
    expect((await cancel({ 'content-type': 'application/json' }, '{"confirm":true}')).status).toBe(404)
    const stranger = await paidWithSession('020 000 0035')
    expect((await cancel(stranger.headers, '{"confirm":true}')).status).toBe(404)
    expect((await cancel(a.headers, '{}')).status).toBe(400)
    const before = nextDropResponse.parse(await $fetch('/api/drops/next')).drop!.spacesLeft
    const done = await cancel(a.headers, '{"confirm":true}')
    expect(done.status).toBe(200)
    expect(await done.json()).toEqual({ status: 'cancelled', refundDue: true })
    expect(nextDropResponse.parse(await $fetch('/api/drops/next')).drop!.spacesLeft).toBe(before + 1)
    expect((await cancel(a.headers, '{"confirm":true}')).status).toBe(409)
  })

  it('Delete my data now: needs confirm, clears the cookie, and the old cookie and link stop working', async () => {
    const a = await paidWithSession('020 000 0033')
    expect((await fetch('/api/me/delete', { method: 'POST', headers: a.headers, body: '{}' })).status).toBe(400)
    const deleted = await fetch('/api/me/delete', { method: 'POST', headers: a.headers, body: '{"confirm":true}' })
    expect(deleted.status).toBe(200)
    expect(deleted.headers.getSetCookie().find((c) => c.startsWith('gc_session='))).toMatch(/Max-Age=0/i)
    expect((await fetch('/api/me', { headers: { cookie: a.cookie } })).status).toBe(404)
    expect((await fetch(`/api/orders/${a.orderId}`, { headers: { cookie: a.cookie } })).status).toBe(404)
    const opened = await fetch(a.linkPath, { redirect: 'manual' })
    expect(opened.headers.get('location')).toBe('/link-invalid')
    // The order itself is kept, anonymised, for the numbers.
    const [row] = await sql<{ customer_id: string | null }[]>`select "customer_id" from "orders" where "id" = ${a.orderId}`
    expect(row).toEqual({ customer_id: null })
  })
})

describe('deployment basics (spec 8)', () => {
  it('GET /api/health answers ok with the database status, and nothing else', async () => {
    const response = await fetch('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, database: true })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('asks search engines not to index pages or API responses', async () => {
    for (const path of ['/', '/api/health', '/api/drops/next']) {
      expect((await fetch(path)).headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
    }
    expect(await $fetch<string>('/')).toMatch(/<meta name="robots" content="noindex, nofollow">/)
  })

  it('refuses request bodies over 16 KB with 413 before any route runs', async () => {
    const big = JSON.stringify({ firstName: 'x'.repeat(17 * 1024) })
    for (const path of ['/api/orders', '/api/owner/login']) {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: big })
      expect(response.status, path).toBe(413)
    }
  })
})

describe('Demo data disclosure (spec constraint 8)', () => {
  it('every page renders the Demo data button, including the owner sign-in', async () => {
    for (const path of ['/', '/order', '/owner/login', '/link-invalid']) {
      const html = await $fetch<string>(path)
      expect(html, path).toMatch(/>\s*Demo data\s*</)
      expect(html, path).not.toContain('Sample price')
    }
  })
})

// Last in the file: the throttle check leaves this IP locked out of owner login for 15 minutes.
describe('owner gate over HTTP (spec 8)', () => {
  const ownerRoutes: [string, string][] = [
    ['GET', '/api/owner/session'],
    ['GET', '/api/owner/drops'],
    ['GET', '/api/owner/metrics'],
    ['GET', '/api/owner/orders'],
    ['GET', '/api/owner/drop/00000000-0000-4000-8000-000000000000/demand'],
    ['POST', '/api/owner/settings/buffer'],
    ['POST', '/api/owner/orders/00000000-0000-4000-8000-000000000000/fulfil'],
    ['POST', '/api/owner/orders/00000000-0000-4000-8000-000000000000/cancel'],
    ['GET', '/api/owner/customers'],
    ['POST', '/api/owner/customers/00000000-0000-4000-8000-000000000000/link'],
    ['GET', '/api/owner/reminders'],
    ['POST', '/api/owner/reminders/00000000-0000-4000-8000-000000000000/send']
  ]
  const login = (passcode: string) =>
    fetch('/api/owner/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode }) })

  async function ownerCookie() {
    const response = await login(ownerPasscode)
    expect(response.status).toBe(200)
    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('gc_owner='))!
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    return setCookie.split(';')[0]!
  }

  it('every owner route answers a bare 401 without the owner session', async () => {
    for (const [method, path] of ownerRoutes) {
      const response = await fetch(path, { method })
      expect(response.status, path).toBe(401)
      // Nitro echoes the request URL; everything else must say nothing about why.
      const { url: _url, ...rest } = (await response.json()) as Record<string, unknown>
      expect(rest).toEqual({ error: true, statusCode: 401, statusMessage: 'Unauthorized', message: 'Unauthorized' })
    }
  })

  it('a customer session cookie never grants owner access', async () => {
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const created = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: next.menu[0]!.id, quantity: 1 }],
        firstName: 'Sample',
        phone: '020 000 0011',
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const customer = created.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    for (const [method, path] of ownerRoutes) {
      expect((await fetch(path, { method, headers: { cookie: customer } })).status, path).toBe(401)
    }
    // Not even with the customer token pasted into the owner cookie.
    const asOwner = `gc_owner=${customer.split('=')[1]}`
    expect((await fetch('/api/owner/session', { headers: { cookie: asOwner } })).status).toBe(401)
  })

  it('a wrong passcode is a bare 401 and sets no cookie', async () => {
    const response = await login('not-the-passcode')
    expect(response.status).toBe(401)
    expect(response.headers.getSetCookie().some((c) => c.startsWith('gc_owner='))).toBe(false)
  })

  it('the right passcode opens the owner routes, and logout closes them again', async () => {
    const cookie = await ownerCookie()
    expect((await fetch('/api/owner/session', { headers: { cookie } })).status).toBe(200)
    const drops = (await (await fetch('/api/owner/drops', { headers: { cookie } })).json()) as { defaultDropId: string }
    const demand = await fetch(`/api/owner/drop/${drops.defaultDropId}/demand`, { headers: { cookie } })
    expect(demand.status).toBe(200)
    const body = (await demand.json()) as { suggested: number | null; units: { paid: number } }
    expect(body.units.paid).toBeGreaterThan(0)
    expect(body.suggested).not.toBeNull()
    expect((await fetch('/api/owner/metrics', { headers: { cookie } })).status).toBe(200)

    expect((await fetch('/api/owner/logout', { method: 'POST', headers: { cookie } })).status).toBe(200)
    expect((await fetch('/api/owner/session', { headers: { cookie } })).status).toBe(401)
  })

  it('O7: masked phones only, and Send new link replaces the customer\'s link (BR-L6)', async () => {
    // A customer who paid and got a private link.
    const next = nextDropResponse.parse(await $fetch('/api/drops/next'))
    const created = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dropId: next.drop!.id,
        lines: [{ menuItemId: next.menu.find((m) => !m.soldOut)!.id, quantity: 1 }],
        firstName: 'Ownerlinktest',
        phone: '020 000 0041',
        fulfilment: 'pickup',
        idempotencyKey: crypto.randomUUID()
      })
    })
    const customer = created.headers.getSetCookie().find((c) => c.startsWith('gc_session='))!.split(';')[0]!
    const { orderId } = (await created.json()) as { orderId: string }
    const headers = { 'content-type': 'application/json', cookie: customer }
    await fetch(`/api/orders/${orderId}/pay-start`, { method: 'POST', headers })
    const paid = (await (
      await fetch('/api/payments/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId, reference: `API-${crypto.randomUUID()}`, outcome: 'success' })
      })
    ).json()) as { privateLink: string }
    const oldPath = new URL(paid.privateLink).pathname

    const cookie = await ownerCookie()
    const list = (await (await fetch('/api/owner/customers?q=ownerlink', { headers: { cookie } })).json()) as {
      customers: { id: string; firstName: string; maskedPhone: string }[]
    }
    expect(list.customers).toHaveLength(1)
    expect(list.customers[0]!.maskedPhone).toMatch(/041$/)
    expect(JSON.stringify(list)).not.toMatch(/0000041|\/c\/|token/i)

    const sent = await fetch(`/api/owner/customers/${list.customers[0]!.id}/link`, { method: 'POST', headers: { cookie } })
    expect(sent.status).toBe(200)
    const body = (await sent.json()) as { privateLink: string; whatsappUrl: string | null }
    expect(body.privateLink).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/)
    expect(body.privateLink).not.toBe(paid.privateLink)
    expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/233200000000\?text=/)
    // The old link stops working; the new one opens C7.
    expect((await fetch(oldPath, { redirect: 'manual' })).headers.get('location')).toBe('/link-invalid')
    expect((await fetch(new URL(body.privateLink).pathname, { redirect: 'manual' })).headers.get('location')).toBe('/same-again')
    await fetch('/api/owner/logout', { method: 'POST', headers: { cookie } })
  })

  it('O5: the queue shows masked phones only; Send gives a reminder link once; /r/ opens C7', async () => {
    const cookie = await ownerCookie()
    expect(await (await fetch('/owner/reminders', { headers: { cookie } })).text()).toContain('Reminders')

    const queue = (await (await fetch('/api/owner/reminders', { headers: { cookie } })).json()) as {
      demoMode: boolean
      drop: { id: string } | null
      dueNow: { reminderId: string; customerId: string; maskedPhone: string }[]
      comingUp: { reminderId: string; customerId: string; maskedPhone: string }[]
    }
    // The seeded live drop is 3 days before cut-off, so its reminders are coming up (BR-R4).
    expect(queue.drop).not.toBeNull()
    expect(queue.comingUp.length).toBeGreaterThan(0)
    const row = queue.comingUp[0]!
    const phones = await sql<{ phone: string }[]>`select "phone" from "customers" where "phone" is not null`
    const text = JSON.stringify(queue)
    for (const { phone } of phones) expect(text).not.toContain(phone)

    // Demo mode: "Send early (demo)" works on a Coming up row.
    expect(queue.demoMode).toBe(true)
    const send = () => fetch(`/api/owner/reminders/${row.reminderId}/send`, { method: 'POST', headers: { cookie } })
    const sent = await send()
    expect(sent.status).toBe(200)
    const body = (await sent.json()) as { text: string; link: string; whatsappUrl: string | null; channel: string }
    expect(body.link).toMatch(new RegExp(`^${appUrl.replace(/\./g, '\\.')}/r/[A-Za-z0-9_-]{43}$`))
    expect(body.text).toContain(body.link)
    if (body.channel === 'whatsapp') expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/233200000000\?text=/)
    for (const { phone } of phones) expect(JSON.stringify(body)).not.toContain(phone)
    // One chase: the same row cannot be sent again.
    expect((await send()).status).toBe(409)

    // The reminder link: a session cookie and C7, like the private link.
    const path = new URL(body.link).pathname
    const opened = await fetch(path, { redirect: 'manual' })
    expect(opened.status).toBe(302)
    expect(opened.headers.get('location')).toBe('/same-again')
    expect(opened.headers.getSetCookie().find((c) => c.startsWith('gc_session='))).toMatch(/HttpOnly/i)

    // A changed token, or the same token after its cut-off, gives nothing.
    const changed = path.slice(0, -1) + (path.endsWith('A') ? 'B' : 'A')
    for (const bad of [changed, '/r/short']) {
      const r = await fetch(bad, { redirect: 'manual' })
      expect(r.headers.get('location'), bad).toBe('/link-invalid')
      expect(r.headers.getSetCookie().some((c) => c.startsWith('gc_session=')), bad).toBe(false)
    }
    await sql`update "access_tokens" set "expires_at" = now() - interval '1 minute' where "kind" = 'reminder'`
    const expired = await fetch(path, { redirect: 'manual' })
    expect(expired.headers.get('location')).toBe('/link-invalid')
    expect(expired.headers.getSetCookie().some((c) => c.startsWith('gc_session='))).toBe(false)
    await fetch('/api/owner/logout', { method: 'POST', headers: { cookie } })
  })

  it('5 failed attempts in 15 minutes gives 429, even for the right passcode', async () => {
    // One failure already happened above; four more reach the limit of 5. Each guess claims a
    // different address in forwarded headers: with TRUST_PROXY off (the default) they are ignored.
    for (let i = 0; i < 4; i++) {
      const spoofed = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${i}`, 'x-vercel-forwarded-for': `203.0.113.${i}` },
        body: JSON.stringify({ passcode: 'not-the-passcode' })
      })
      expect(spoofed.status).toBe(401)
    }
    expect((await login(ownerPasscode)).status).toBe(429)
  })
})
