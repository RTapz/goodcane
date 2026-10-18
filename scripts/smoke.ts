// pnpm smoke --url <base>: proves a deployed GoodCane Drops works end to end, over HTTP only.
//
// It places ONE sample order (pickup, a made-up name and phone), pays it with the simulated
// payment, reorders once and logs in to the owner screens. Afterwards, reseed to clean up
// (README, Deployment). The owner passcode is read from $env:OWNER_PASSCODE and is never
// printed or written anywhere. Exits non-zero if any step fails.
import { randomUUID } from 'node:crypto'

const urlArg = process.argv.indexOf('--url')
const base = urlArg > 0 ? process.argv[urlArg + 1]?.replace(/\/$/, '') : undefined
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: pnpm smoke --url https://your-app.vercel.app')
  process.exit(2)
}

/** A browser's cookies: name to value, filled from Set-Cookie and sent back on every request. */
class CookieJar {
  private cookies = new Map<string, string>()
  store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const at = pair!.indexOf('=')
      this.cookies.set(pair!.slice(0, at).trim(), pair!.slice(at + 1).trim())
    }
  }
  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
  has(name: string) {
    return this.cookies.has(name)
  }
}

async function call(jar: CookieJar | null, path: string, init: { method?: string; body?: unknown; redirect?: RequestRedirect } = {}) {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (jar?.header()) headers.cookie = jar.header()
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: init.redirect ?? 'follow'
  })
  jar?.store(response)
  const text = await response.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Not JSON (an HTML page or a redirect): leave json null.
  }
  return { status: response.status, json, headers: response.headers }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

let failures = 0
let stopCustomerSteps = false
async function step(name: string, run: () => Promise<void>, customerFlow = true) {
  if (customerFlow && stopCustomerSteps) {
    console.log(`SKIP  ${name} (an earlier step failed)`)
    return
  }
  try {
    await run()
    console.log(`PASS  ${name}`)
  } catch (error) {
    failures += 1
    if (customerFlow) stopCustomerSteps = true
    console.log(`FAIL  ${name}: ${(error as Error).message}`)
  }
}

console.log(`Smoke test against ${base}`)
console.log('This writes SAMPLE data only (one pickup order and one reorder). Reseed afterwards to clean up.\n')

const browser = new CookieJar()
let drop: { id: string } | null = null
let item: { id: string; pricePesewas: number } | null = null
let orderId = ''
let privateLinkPath = ''
const linkBrowser = new CookieJar()
let lastLines: { menuItemId: string; quantity: number; unitPricePesewas: number }[] = []

await step('health: app up and database answering', async () => {
  const r = await call(null, '/api/health')
  expect(r.status === 200, `status ${r.status}`)
  expect(r.json?.ok === true && r.json?.database === true, `got ${JSON.stringify(r.json)}`)
  expect(r.headers.get('x-robots-tag') === 'noindex, nofollow', 'X-Robots-Tag missing')
})

await step('next drop: open, with an orderable item', async () => {
  const r = await call(null, '/api/drops/next')
  expect(r.status === 200 && r.json?.drop, 'no open drop (reseed?)')
  drop = r.json.drop
  item = r.json.menu.find((m: { soldOut: boolean }) => !m.soldOut) ?? null
  expect(item, 'every item is sold out')
})

await step('create order: requested, with a session cookie', async () => {
  const r = await call(browser, '/api/orders', {
    method: 'POST',
    body: {
      dropId: drop!.id,
      lines: [{ menuItemId: item!.id, quantity: 1 }],
      firstName: 'Smoke test',
      phone: '0200000099',
      fulfilment: 'pickup',
      idempotencyKey: randomUUID()
    }
  })
  expect(r.status === 201, `status ${r.status} ${r.json?.statusMessage ?? ''}`)
  expect(browser.has('gc_session'), 'no gc_session cookie')
  orderId = r.json.orderId
})

await step('pay-start: spaces held', async () => {
  const r = await call(browser, `/api/orders/${orderId}/pay-start`, { method: 'POST' })
  expect(r.status === 200 && r.json?.holdExpiresAt, `status ${r.status} ${r.json?.statusMessage ?? ''}`)
})

await step('simulate success: confirmed, private link returned once', async () => {
  const r = await call(browser, '/api/payments/simulate', {
    method: 'POST',
    body: { orderId, reference: `SMOKE-${randomUUID()}`, outcome: 'success' }
  })
  expect(r.status === 200 && r.json?.result === 'confirmed', `got ${r.status} ${r.json?.result}`)
  expect(r.json.privateLink, 'no private link')
  const link = new URL(r.json.privateLink)
  expect(link.origin === new URL(base).origin, `private link host ${link.host} does not match --url (check the app URL variable)`)
  privateLinkPath = link.pathname
})

await step('/api/me: the session knows the customer and the paid order', async () => {
  const r = await call(browser, '/api/me')
  expect(r.status === 200 && r.json?.lastOrder?.orderId === orderId, `status ${r.status}`)
  expect(!JSON.stringify(r.json).includes('0200000099'), 'full phone number exposed')
})

await step('open the private link in a new browser: redirect with a session', async () => {
  const r = await call(linkBrowser, privateLinkPath, { redirect: 'manual' })
  expect(r.status === 302, `status ${r.status}`)
  expect((r.headers.get('location') ?? '').includes('/same-again'), `landed on ${r.headers.get('location')}`)
  expect(linkBrowser.has('gc_session'), 'no session cookie from the link')
  const me = await call(linkBrowser, '/api/me')
  expect(me.status === 200, `me status ${me.status}`)
  lastLines = me.json.lastOrder.lines
})

const reorderTotal = () => lastLines.reduce((sum, l) => sum + l.quantity * l.unitPricePesewas, 0)

await step('price guard: a wrong expected total gets 409 price_changed', async () => {
  const r = await call(linkBrowser, '/api/orders', {
    method: 'POST',
    body: {
      reorder: true,
      dropId: drop!.id,
      lines: lastLines.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })),
      fulfilment: 'pickup',
      idempotencyKey: randomUUID(),
      expectedTotalPesewas: reorderTotal() + 1
    }
  })
  expect(r.status === 409 && r.json?.data?.reason === 'price_changed', `got ${r.status} ${r.json?.statusMessage ?? ''}`)
})

await step('reorder (C7): same again from the link session', async () => {
  const r = await call(linkBrowser, '/api/orders', {
    method: 'POST',
    body: {
      reorder: true,
      dropId: drop!.id,
      lines: lastLines.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })),
      fulfilment: 'pickup',
      idempotencyKey: randomUUID(),
      expectedTotalPesewas: reorderTotal()
    }
  })
  expect(r.status === 201 && r.json?.orderId, `got ${r.status} ${r.json?.statusMessage ?? ''}`)
})

await step('another cookie: the order is 404 without its session', async () => {
  const stranger = new CookieJar()
  const none = await call(stranger, `/api/orders/${orderId}`)
  const forged = await fetch(`${base}/api/orders/${orderId}`, { headers: { cookie: `gc_session=${randomUUID()}` } })
  expect(none.status === 404 && forged.status === 404, `got ${none.status} and ${forged.status}`)
})

// Owner gate: runs even if a customer step failed.
const owner = new CookieJar()
await step(
  'owner routes: 401 without the owner cookie',
  async () => {
    for (const path of ['/api/owner/session', '/api/owner/drops', '/api/owner/metrics']) {
      const r = await call(new CookieJar(), path)
      expect(r.status === 401, `${path} gave ${r.status}`)
    }
    const asCustomer = await call(browser, '/api/owner/session')
    expect(asCustomer.status === 401, `customer cookie gave ${asCustomer.status}`)
  },
  false
)

let loggedIn = false
await step(
  'owner login with $env:OWNER_PASSCODE',
  async () => {
    const passcode = process.env.OWNER_PASSCODE
    expect(passcode, 'OWNER_PASSCODE is not set for this command')
    const r = await call(owner, '/api/owner/login', { method: 'POST', body: { passcode } })
    expect(r.status === 200 && owner.has('gc_owner'), `status ${r.status}`)
    loggedIn = true
  },
  false
)

await step(
  'owner demand view loads',
  async () => {
    expect(loggedIn, 'not logged in')
    const drops = await call(owner, '/api/owner/drops')
    expect(drops.status === 200 && drops.json?.defaultDropId, `drops status ${drops.status}`)
    const demand = await call(owner, `/api/owner/drop/${drops.json.defaultDropId}/demand`)
    expect(demand.status === 200 && 'suggested' in demand.json, `demand status ${demand.status}`)
  },
  false
)

await step(
  'owner logout: the session stops working',
  async () => {
    expect(loggedIn, 'not logged in')
    const out = await call(owner, '/api/owner/logout', { method: 'POST' })
    expect(out.status === 200, `logout status ${out.status}`)
    const after = await call(owner, '/api/owner/session')
    expect(after.status === 401, `after logout ${after.status}`)
  },
  false
)

console.log(failures === 0 ? '\nAll steps passed.' : `\n${failures} step(s) failed.`)
console.log('Clean up: reseed (README, Deployment) to remove the smoke test orders.')
process.exit(failures === 0 ? 0 : 1)
