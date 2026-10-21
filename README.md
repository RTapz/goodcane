# GoodCane Drops (demo)

**Live demo:** _link to be added after deployment_

A mobile-first pre-order and reorder prototype for GoodCane's bottled sugarcane drinks. Everything here is a demo: sample data, no real payments, no real messages. The full brief is in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md).

## Setup

Needs Node 22 or newer, pnpm and PostgreSQL.

1. `pnpm install`
2. Create a database, for example `goodcane_drops`.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `OWNER_PASSCODE` (never commit `.env`).
4. `pnpm db:migrate` to create the tables.
5. `pnpm seed` to load sample data.
6. `pnpm dev` and open http://localhost:3000. The owner screens are at http://localhost:3000/owner.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Runs the app locally |
| `pnpm test` | Unit tests (Vitest), fast and database-free |
| `pnpm test:integration` | Orders, payments, the demand view and the owner gate against a real database (`TEST_DATABASE_URL`, name must end in `_test`) |
| `pnpm test:api` | Builds the app and calls it over HTTP against the test database, which it migrates and seeds itself (about a minute) |
| `pnpm typecheck` | Type checks the whole project |
| `pnpm db:generate` | Creates a new migration after a schema change |
| `pnpm db:migrate` | Applies migrations to `MIGRATION_DATABASE_URL`, else `DATABASE_URL`. Refuses a remote database unless `ALLOW_REMOTE_DB=true` |
| `pnpm seed` | Resets all sample data (see below). Same database choice and remote guard as `db:migrate` |
| `pnpm smoke --url <base>` | Proves a deployed app works end to end over HTTP (see Deployment). Writes sample data and cancels its own orders |
| `pnpm retention` | Retention purge (not built yet) |

## Sample data (`pnpm seed`)

- Runs in one transaction: deletes every `is_sample` row, re-adds the 12 owner settings, inserts 8 completed drops, a live drop, a further open drop, 40 sample customers, orders, payments, reminders and consent events, then verifies the result. If any check fails, everything is rolled back.
- Uses a fixed random seed. Two runs in the same hour give identical data. Set `SEED_NOW` (an ISO date) to reproduce an exact run.
- **Seed dates ignore the `drop_days` setting on purpose.** They are relative to now, so the demo always has a live drop about 3 days before cut-off, whatever day you run it.
- Forecast snapshots for the finished drops are written with the same function the owner screen uses, so the accuracy metric has scored drops from the start.
- Customers are "Sample Customer 01" to "Sample Customer 40" with fake phone numbers `0000000001` to `0000000040`. No real people, prices or messages are involved.

- The final check compares the arrival pattern the seed learns back (`learnPaceTable`) with the one it was generated from (`pickDay`), and fails if any day is more than 8 points off. [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) explains both functions.
- It also checks the live drop the way customers see it (paid units and active holds, as `GET /api/drops/next` counts them): 28 to 36 paid units, 9 to 16 requested units and at least one space left. The output shows a "Live drop" line.
- **Smoke test leftovers** are always removed: every order on a sample drop (flagged or not) and every customer with the smoke marker (first name "Smoke test", phone `+233200000099`, in `server/db/seed/smoke-marker.ts`), even if a deployment outside demo mode wrote them unflagged.

## Owner screens (demo gate)

- `/owner` (This drop: demand, forecast, buffer, pilot metrics) and `/owner/orders` (fulfil, cancel, refund-due flags) sit behind one passcode, `OWNER_PASSCODE`. Each valid login gets a random session token in an HttpOnly cookie, `gc_owner`; only its hash is stored, and it lasts 12 hours. The customer cookie never opens these screens.
- After 5 wrong passcodes from one IP within 15 minutes, that IP gets "Too many attempts" (429) until the oldest of those failures is more than 15 minutes old. Only a hash of the IP and the time are kept, for 24 hours.
- **This is a demo gate, not real authentication.** A live service needs proper owner accounts (individual logins, password reset, ideally two-factor). See `TRUST_PROXY` below for where the client address comes from.
- **`TRUST_PROXY`** (default `false`). When `false`, the lockout counts attempts against the address of the connection. On Vercel every request arrives from Vercel's own servers, so set it to `true` there: the lockout then reads the client address from `x-vercel-forwarded-for`, which Vercel sets itself. Other forwarded headers such as `X-Forwarded-For` are ignored in both modes, because any client can fill them in. Do not set it to `true` anywhere else, or clients could choose their own address by sending that header.
- The forecast is explained step by step in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md), section 6.

## Customer screens beyond ordering

- `/manage` (C9): order history, **Cancel this order** before cut-off (paid orders get refund due), reminder settings with **Stop reminders** and **Resubscribe** (only here, BR-R8), and **Delete my data now** (BR-DP2). It works only with this phone's session, which the private link creates; never by phone number.
- `/link-invalid` and the home page (for a phone with no session) offer **Lost your link? Message GoodCane**: a prefilled chat to `DEMO_WHATSAPP_NUMBER` asking for the first name only, or the text to copy when that is empty.
- `/about` (C0): what is real and simulated, the assumptions, data practices and the forecast honesty note. Linked from the footer.
- **Try as a returning customer:** https://goodcane.vercel.app/c/DemoCustomerA-GoodCaneDrops-sampleLink-0001 opens "Same again?" as **Demo Customer A**, a sample customer with a past usual order, opted in to reminders. It exists only when the seed runs in demo mode, and every reseed rebuilds it. **Delete my data now** or the owner's **Send new link** on this customer kills the link until the next reseed. This is the one exception to "the private link is shown once" (spec BR-L4).
- `/owner/customers` (O7): masked phones, search by first name, and **Send new link**, which revokes the old link and shows the new one once.
- `/owner/reminders` (O5): the reminder queue for the next drop, built when the page is opened (no cron). **Due now** from 2 days before cut-off; **Coming up** before that, with **Send early (demo)** in demo mode only. Send opens a prefilled chat with a fresh `/r/<token>` link that works until that drop's cut-off, and marks the reminder sent: one per customer per drop. The 24-hour confirm nudge (BR-R6) is designed, not built.

## Known limitations

- **Session after a lost response.** Orders are idempotent: a repeated submission returns the same order (see [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md), section 3). But if the first response is lost and only the replay's response arrives, the browser can end up without a session cookie, because the server stores only the token's hash and cannot send it again. The customer then sees "We can't find this order on this device" and can place the order again; the earlier request lapses after 2 days. The same applies to the private link after payment: if the response carrying it is lost, the customer can open C6 and use **Make a new link** (which revokes the old one).
- **Rate limiting** is a Vercel WAF rule set in the dashboard (see Deployment), not code: serverless instances share no memory, so an in-memory limiter would reset at random and protect nothing.
- **Session cookie** is marked `Secure` outside `pnpm dev`, so a production build served over plain http (for example `nuxt preview` on a LAN) will not keep a session.

## Privacy and the private link

- **Sample data only.** The demo holds no real customers, prices or payments. Phone numbers and tokens are never written to logs.
- **The private link is a key.** It works every time it is opened until it is replaced, so anyone with it can see that customer's orders. Only its SHA-256 hash is stored; the raw link is shown once on the confirmation page.
- **It sits in the URL path** (`/c/<token>`). Hosting platforms and proxies may record request paths in their access logs, so in a deployed demo the token can end up in those logs. That is acceptable for sample data. A live service would use a short-lived exchange step instead: the link carries a one-time code that the page swaps, in a request body, for a session, so the long-lived secret never appears in a URL. The redirect after opening the link sends `Referrer-Policy: no-referrer` so the token is not passed on to other sites.
- **Lost or exposed link:** the customer can open the confirmation page on a device that still has a session and choose **Make a new link**; the old link stops working at once.
- **Send to my WhatsApp** opens a chat with `DEMO_WHATSAPP_NUMBER` (the developer's own number) only, never GoodCane's or a customer's number, and the app never sends anything itself.

## Environment variables

Locally, the app, migrations and the seed read the plain names from `.env`. On Vercel, Nuxt only applies variables whose names start with `NUXT_` at runtime, so the deployed names differ (and nothing secret is baked into the build). Never put a Supabase connection string in `.env` or any file: set it in Vercel, or for one command as shown under Deployment.

| Variable (local) | Name on Vercel | What it is for | Where it is set | Deployed value |
|---|---|---|---|---|
| `DATABASE_URL` | `NUXT_DATABASE_URL` | The app's database connection | `.env` locally; Vercel, Production only | Supabase **transaction pooler** string (port 6543) |
| `MIGRATION_DATABASE_URL` | (not on Vercel) | Migrations and the seed; falls back to `DATABASE_URL` | One PowerShell command | Supabase **session pooler** string (port 5432) |
| `ALLOW_REMOTE_DB` | (not on Vercel) | Lets `pnpm db:migrate` and `pnpm seed` change a remote database | One PowerShell command | `true`, only for those commands |
| `DATABASE_POOL_MODE` | (not needed) | `transaction` forces pooled settings; used to test them locally | Test runs only | Not set (port 6543 already means pooled) |
| `DEMO_MODE` | `NUXT_PUBLIC_DEMO_MODE` | Flags every row the app creates as sample data | `.env`; Vercel | `true` |
| `DEMO_WHATSAPP_NUMBER` | `NUXT_DEMO_WHATSAPP_NUMBER` | The only number a wa.me link may use; empty hides the button | `.env`; Vercel | Empty |
| `OWNER_PASSCODE` | `NUXT_OWNER_PASSCODE` | The demo owner gate | `.env`; Vercel; `$env` for the smoke test | A demo passcode for reviewers (see below) |
| `TRUST_PROXY` | `NUXT_TRUST_PROXY` | Read the client address from `x-vercel-forwarded-for` for the login limit | `.env` (false); Vercel | `true` (Vercel only) |
| `APP_URL` | `NUXT_PUBLIC_APP_URL` | Base of private links (`/c/<token>`) | `.env`; Vercel | `https://<your-project>.vercel.app` |
| `TEST_DATABASE_URL` | (not on Vercel) | Integration and API tests; name must end in `_test` | `.env` | Not deployed |

**OWNER_PASSCODE is a demo passcode shown to reviewers.** Never use a password you use anywhere else.

## Deployment (Vercel and Supabase)

Functions run in **`dub1` (Dublin)**, set in `vercel.json`. Vercel's `dub1` is AWS eu-west-1, the same region as the Supabase project, so every database round trip stays in Dublin. Vercel's default, `iad1` (Washington), would add a transatlantic hop to every query. Nuxt is detected by Vercel automatically; `vercel.json` only sets the region.

In order:

1. **Supabase.** Create the project in eu-west-1. From **Connect**, copy the **transaction pooler** string (port 6543) and the **session pooler** string (port 5432). The app does not use the Data API or any anon key: you can turn the Data API off under the project's API settings.
2. **Vercel variables.** In the project's Settings, Environment Variables, add these for **Production only** (previews then build without a database and simply report `database: false` on `/api/health`):
   `NUXT_DATABASE_URL`, `NUXT_OWNER_PASSCODE`, `NUXT_TRUST_PROXY` = `true`, `NUXT_PUBLIC_DEMO_MODE` = `true`, `NUXT_PUBLIC_APP_URL` = your production URL, `NUXT_DEMO_WHATSAPP_NUMBER` = empty.
3. **Deploy** from GitHub (push, then let Vercel build), and check `https://<your-app>/api/health` shows `{"ok":true,"database":true}`.
4. **Migrate and seed from your PC**, against the session pooler. Each line sets the variables, runs one command, then removes them (in PowerShell, `$env:` lasts for the whole window otherwise). Paste the string from the Supabase dashboard where shown; never save it in a file:

   ```powershell
   $env:ALLOW_REMOTE_DB="true"; $env:MIGRATION_DATABASE_URL="<session pooler string>"; pnpm db:migrate; Remove-Item Env:ALLOW_REMOTE_DB, Env:MIGRATION_DATABASE_URL
   ```

   ```powershell
   $env:ALLOW_REMOTE_DB="true"; $env:MIGRATION_DATABASE_URL="<session pooler string>"; pnpm seed; Remove-Item Env:ALLOW_REMOTE_DB, Env:MIGRATION_DATABASE_URL
   ```

5. **Smoke test** the live app. It writes one sample order and one reorder, logs in to the owner screens with the passcode from `$env:OWNER_PASSCODE` (never printed or saved), checks its orders are flagged as sample data, then cancels them as the owner so they use no capacity. It prints PASS, FAIL or SKIP per step and a summary such as `16 passed, 0 failed, 0 skipped (0 required)`. The run fails if any step fails or any required step is skipped. If the live drop is full, the first failing step says why: capacity, paid units and units in active holds.

   ```powershell
   $env:OWNER_PASSCODE="<the demo passcode>"; pnpm smoke --url https://<your-app>.vercel.app; Remove-Item Env:OWNER_PASSCODE
   ```

6. **Reseed** (step 4's seed command again) to remove the cancelled smoke test orders for good and reset the live drop to about 30 paid and 10 requested units. Every walk through the deployed demo that pays an order also uses the live drop's spaces, so reseed before a demo or review.

**Rate limiting.** Add one WAF rule in the Vercel dashboard (Firewall, Configure, New Rule, Then: Rate Limit; available on Hobby with 1 rate-limit rule, fixed window of 10 seconds to 10 minutes, keyed by IP). Suggested: path starts with `/api/orders`, method POST, 10 requests per 60 seconds per IP, action 429.

### Security notes

- The app connects to Supabase **only from the server**. The Supabase Data API is not used, and no anon or service key exists in the code or the browser.
- **Row level security is on for every table, with no policies** (migration 0004, tested). The app connects as the table owner, which bypasses RLS; anyone reaching the Data API with an anon key would read nothing.
- Every response has `X-Robots-Tag: noindex, nofollow` and every page a robots meta tag, so the demo is not indexed. Every page shows the Demo data button.
- Request bodies on `/api/*` are capped at 16 KB (413), every input string has a length limit, and one session may hold at most 3 unpaid requests (BR-O10).

### Database connections and the transaction pooler

On Vercel the app uses the transaction pooler (port 6543), which hands each transaction to whichever server connection is free. `server/db/client.ts` therefore turns off prepared statements (`prepare: false`), uses one connection per instance and requires SSL. Locally, `DATABASE_POOL_MODE=transaction` applies the same settings, and every test suite passes in both modes.

What stays correct, and why:

- **Capacity (`SELECT ... FOR UPDATE`).** Row locks belong to a transaction. The pooler keeps a whole transaction on one server connection, so the drop row stays locked from the lock to `COMMIT`, exactly as before. `tests/integration/pooled.test.ts` races two separate pooled clients (two "instances") for the last spaces: exactly one hold wins.
- **Idempotency.** Duplicate orders and payments are stopped by unique constraints and `ON CONFLICT` in the database, which do not depend on which connection a request uses.
- **Owner login limit.** It uses `pg_advisory_xact_lock`, a transaction-scoped lock released at `COMMIT`. Session-level locks would not be safe with this pooler, and none are used (nor `SET` or temporary tables). The same test file fires parallel wrong passcodes from both clients: they stop at exactly 5.

### Known limits of this demo

- Sample data only: drinks, prices, dates, the pickup point, delivery areas and customers are made up, and payment is a simulation.
- The owner gate is one shared demo passcode, not owner accounts.
- The private link travels in the URL path and can appear in hosting logs (see Privacy below).
- Rate limiting depends on the Vercel WAF rule above; without it, anyone can create many sample orders (each session is capped at 3 unpaid ones).
- No reminders are ever sent, and the deployed demo shows no WhatsApp button (`NUXT_DEMO_WHATSAPP_NUMBER` is empty).
- One region (`dub1`) and one small database: fine for reviewers, not sized for real traffic.
