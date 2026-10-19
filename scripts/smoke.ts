// pnpm smoke --url <base>: proves a deployed GoodCane Drops works end to end, over HTTP only.
//
// It places ONE sample order (pickup, the smoke test customer from server/db/seed/smoke-marker.ts),
// pays it with the simulated payment, reorders once and logs in to the owner screens. It checks its
// orders are flagged as sample data, then cancels them as the owner so they use no capacity; a
// reseed removes them for good (README, Deployment). The owner passcode is read from
// $env:OWNER_PASSCODE and is never printed or written anywhere. Exits non-zero if any step fails or
// any required step is skipped.
import { randomUUID } from 'node:crypto'
import { SMOKE_FIRST_NAME, SMOKE_PHONE_INPUT } from '../server/db/seed/smoke-marker'
import { soldOutMessage, summarise, type StepResult } from './smoke-report'

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

async function ownerLogin(jar: CookieJar): Promise<boolean> {
  const passcode = process.env.OWNER_PASSCODE
  if (!passcode) return false
  const r = await call(jar, '/api/owner/login', { method: 'POST', body: { passcode } })
  return r.status === 200 && jar.has('gc_owner')
}

const results: StepResult[] = []
let stopCustomerSteps = false

interface StepOptions {
  /** Customer steps depend on each other: after one fails, the rest are skipped. */
  customerFlow?: boolean
  /** A skipped required step fails the run. */
  required?: boolean
  /** Returns why the step cannot run (it is then skipped), or null. */
  needs?: () => string | null
}

async function step(name: string, run: () => Promise<void>, options: StepOptions = {}) {
  const { customerFlow = true, required = true, needs } = options
  const skipReason = customerFlow && stopCustomerSteps ? 'an earlier step failed' : (needs?.() ?? null)
  if (skipReason) {
    results.push({ name, status: 'skip', required })
    console.log(`SKIP  ${name} (${skipReason}${required ? '' : ', not required'})`)
    return
  }
  try {
    await run()
    results.push({ name, status: 'pass', required })
    console.log(`PASS  ${name}`)
  } catch (error) {
    results.push({ name, status: 'fail', required })
    if (customerFlow) stopCustomerSteps = true
    console.log(`FAIL  ${name}: ${(error as Error).message}`)
  }
}

console.log(`Smoke test against ${base}`)
console.log('This writes SAMPLE data only (one pickup order and one reorder) and cancels it at the end.\n')

const browser = new CookieJar()
let drop: { id: string } | null = null
let item: { id: string; pricePesewas: number } | null = null
let orderId = ''
let reorderId = ''
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
  if (item) return

  // Explain it: capacity and spaces left are public; paid units and holds need the owner view.
  const facts = {
    dropAt: r.json.drop.dropAt as string,
    capacity: r.json.drop.capacity as number,
    spacesLeft: r.json.drop.spacesLeft as number,
    nextDropSpaces: (r.json.nextDrop?.spacesLeft ?? null) as number | null
  }
  const owner = new CookieJar()
  try {
    if (await ownerLogin(owner)) {
      const demand = await call(owner, `/api/owner/drop/${r.json.drop.id}/demand`)
      if (demand.status === 200) {
        Object.assign(facts, { paidUnits: demand.json.units.paid, heldUnits: demand.json.units.held })
      }
      await call(owner, '/api/owner/logout', { method: 'POST' })
    }
  } catch {
    // The explanation is best effort: the step fails either way.
  }
  throw new Error(soldOutMessage(facts))
})

await step('create order: requested, with a session cookie', async () => {
  const r = await call(browser, '/api/orders', {
    method: 'POST',
    body: {
      dropId: drop!.id,
      lines: [{ menuItemId: item!.id, quantity: 1 }],
      firstName: SMOKE_FIRST_NAME,
      phone: SMOKE_PHONE_INPUT,
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
  expect(!JSON.stringify(r.json).includes(SMOKE_PHONE_INPUT), 'full phone number exposed')
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
  reorderId = r.json.orderId
})

await step('another cookie: the order is 404 without its session', async () => {
  const stranger = new CookieJar()
  const none = await call(stranger, `/api/orders/${orderId}`)
  const forged = await fetch(`${base}/api/orders/${orderId}`, { headers: { cookie: `gc_session=${randomUUID()}` } })
  expect(none.status === 404 && forged.status === 404, `got ${none.status} and ${forged.status}`)
})

// Owner steps: they run even if a customer step failed, so the smoke orders are always cleaned up.
const owner = new CookieJar()
const ownerStep = { customerFlow: false }
let loggedIn = false
const needsLogin = () => (loggedIn ? null : 'owner login failed')
const smokeOrderIds = () => [orderId, reorderId].filter(Boolean)

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
  ownerStep
)

await step(
  'owner login with $env:OWNER_PASSCODE',
  async () => {
    expect(process.env.OWNER_PASSCODE, 'OWNER_PASSCODE is not set for this command')
    expect(await ownerLogin(owner), 'login refused')
    loggedIn = true
  },
  ownerStep
)

await step(
  'owner demand view loads',
  async () => {
    const drops = await call(owner, '/api/owner/drops')
    expect(drops.status === 200 && drops.json?.defaultDropId, `drops status ${drops.status}`)
    const demand = await call(owner, `/api/owner/drop/${drops.json.defaultDropId}/demand`)
    expect(demand.status === 200 && 'suggested' in demand.json, `demand status ${demand.status}`)
  },
  { ...ownerStep, needs: needsLogin }
)

await step(
  'smoke orders are flagged sample',
  async () => {
    const r = await call(owner, `/api/owner/orders?drop=${drop!.id}`)
    expect(r.status === 200, `orders status ${r.status}`)
    for (const id of smokeOrderIds()) {
      const order = r.json.orders.find((o: { id: string }) => o.id === id)
      expect(order, `smoke order ${id} is not in the owner list`)
      expect(order.isSample === true, 'a smoke order is not flagged sample: the deployment is not in demo mode (NUXT_PUBLIC_DEMO_MODE)')
    }
  },
  { ...ownerStep, needs: () => needsLogin() ?? (smokeOrderIds().length ? null : 'no smoke order was made') }
)

await step(
  'clean up: the owner cancels the smoke orders',
  async () => {
    for (const id of smokeOrderIds()) {
      const r = await call(owner, `/api/owner/orders/${id}/cancel`, { method: 'POST', body: { confirm: true } })
      expect(r.status === 200 && r.json?.status === 'cancelled', `cancelling ${id} gave ${r.status} ${r.json?.statusMessage ?? ''}`)
    }
  },
  {
    ...ownerStep,
    // Required only when there is something to clean up (evaluated here, after the customer steps).
    required: smokeOrderIds().length > 0,
    needs: () => needsLogin() ?? (smokeOrderIds().length ? null : 'no smoke order was made')
  }
)

await step(
  'owner logout: the session stops working',
  async () => {
    const out = await call(owner, '/api/owner/logout', { method: 'POST' })
    expect(out.status === 200, `logout status ${out.status}`)
    const after = await call(owner, '/api/owner/session')
    expect(after.status === 401, `after logout ${after.status}`)
  },
  { ...ownerStep, needs: needsLogin }
)

const summary = summarise(results)
console.log(`\n${summary.line}`)
if (summary.requiredSkipped.length > 0) {
  console.log(`Required steps skipped:\n  - ${summary.requiredSkipped.join('\n  - ')}`)
}
console.log(summary.ok ? 'All steps passed.' : 'Smoke test FAILED.')
console.log('Reseed (README, Deployment) to remove the cancelled smoke test orders for good.')
process.exit(summary.ok ? 0 : 1)
