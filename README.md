# GoodCane Drops (demo)

A mobile-first pre-order and reorder prototype for GoodCane's bottled sugarcane drinks. Everything here is a demo: sample data, no real payments, no real messages. The full brief is in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md).

## Setup

Needs Node 22 or newer, pnpm and PostgreSQL.

1. `pnpm install`
2. Create a database, for example `goodcane_drops`.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (never commit `.env`).
4. `pnpm db:migrate` to create the tables.
5. `pnpm seed` to load sample data.
6. `pnpm dev` and open http://localhost:3000.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Runs the app locally |
| `pnpm test` | Unit tests (Vitest), fast and database-free |
| `pnpm test:integration` | Order creation against a real database (`TEST_DATABASE_URL`, name must end in `_test`) |
| `pnpm test:api` | Builds the app and calls it over HTTP against the test database, which it migrates and seeds itself (about a minute) |
| `pnpm typecheck` | Type checks the whole project |
| `pnpm db:generate` | Creates a new migration after a schema change |
| `pnpm db:migrate` | Applies migrations to `DATABASE_URL` |
| `pnpm seed` | Resets all sample data (see below) |
| `pnpm retention` | Retention purge (not built yet) |

## Sample data (`pnpm seed`)

- Runs in one transaction: deletes every `is_sample` row, re-adds the 12 owner settings, inserts 8 completed drops, a live drop, a further open drop, 40 sample customers, orders, payments, reminders and consent events, then verifies the result. If any check fails, everything is rolled back.
- Uses a fixed random seed. Two runs in the same hour give identical data. Set `SEED_NOW` (an ISO date) to reproduce an exact run.
- **Seed dates ignore the `drop_days` setting on purpose.** They are relative to now, so the demo always has a live drop about 3 days before cut-off, whatever day you run it.
- Customers are "Sample Customer 01" to "Sample Customer 40" with fake phone numbers `0000000001` to `0000000040`. No real people, prices or messages are involved.

- The final check compares the arrival pattern the seed learns back (`learnPaceTable`) with the one it was generated from (`pickDay`), and fails if any day is more than 8 points off. [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) explains both functions.

## Known limitations

- **Session after a lost response.** Orders are idempotent: a repeated submission returns the same order (see [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md), section 3). But if the first response is lost and only the replay's response arrives, the browser can end up without a session cookie, because the server stores only the token's hash and cannot send it again. The customer then sees "We can't find this order on this device" and can place the order again; the earlier request lapses after 2 days. The same applies to the private link after payment: if the response carrying it is lost, the customer can open C6 and use **Make a new link** (which revokes the old one).
- **Rate limiting** on order creation (spec section 8) is deferred to the deployment checklist.
- **Session cookie** is marked `Secure` outside `pnpm dev`, so a production build served over plain http (for example `nuxt preview` on a LAN) will not keep a session.

## Privacy and the private link

- **Sample data only.** The demo holds no real customers, prices or payments. Phone numbers and tokens are never written to logs.
- **The private link is a key.** It works every time it is opened until it is replaced, so anyone with it can see that customer's orders. Only its SHA-256 hash is stored; the raw link is shown once on the confirmation page.
- **It sits in the URL path** (`/c/<token>`). Hosting platforms and proxies may record request paths in their access logs, so in a deployed demo the token can end up in those logs. That is acceptable for sample data. A live service would use a short-lived exchange step instead: the link carries a one-time code that the page swaps, in a request body, for a session, so the long-lived secret never appears in a URL. The redirect after opening the link sends `Referrer-Policy: no-referrer` so the token is not passed on to other sites.
- **Lost or exposed link:** the customer can open the confirmation page on a device that still has a session and choose **Make a new link**; the old link stops working at once.
- **Send to my WhatsApp** opens a chat with `DEMO_WHATSAPP_NUMBER` (the developer's own number) only, never GoodCane's or a customer's number, and the app never sends anything itself.
