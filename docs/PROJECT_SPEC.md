# GoodCane Drops: Project Spec (PRD)

Status: v1, 14 Oct 2026. Owner: Ryan.
This file is the single source of truth for the build. If code and this spec disagree, the spec wins. If a decision changes, update this file first, then the code.

Priority tags used throughout:
- **P0**: finish first. The customer journey cannot be demonstrated without it.
- **P1**: required by the brief or rubric. Build after P0.
- **P2**: only if time allows. If not built, describe it in the write-up as "designed, not built".

---

## 1. Context

- **Gig:** CODED Virtual Paid Gigs EP11, GoodCane (hosts: Coded E Matrix Tech, John Pabi Ntifo). Prize GHS 1,000, terms to be confirmed with CODED.
- **Deadline:** Saturday 24 Oct 2026, 9am. Target finish: Thursday 22 Oct.
- **Client:** GoodCane, a B2C pressed sugarcane drinks brand with TikTok interest but no reliable ordering routine.
- **Brief goal:** turn product discovery into repeat orders and more predictable demand. Help customers order again. Give the business a clear view of upcoming demand.
- **Deliverables:**
  1. Working prototype with deployed link and source repository.
  2. Short video: a customer ordering, returning to order again, and the business reviewing demand.
  3. Written explanation: customer problem, assumptions, chosen approach, rollout plan.
  4. Measurement plan: repeat-order rate, confirmed weekly orders, cancellations, forecast accuracy, and how to validate demand with a small pilot.
- **Rubric (no weights given):**
  1. Clarity of the demand problem
  2. Ease of ordering and reordering on mobile
  3. Usefulness of the business demand view
  4. Working end-to-end demonstration
  5. Realistic pilot and measurement plan
  6. Privacy and operational practicality
- **Tie-breaker:** a finished customer journey matters more than the number of features.
- **App name (demo):** GoodCane Drops.

## 2. Problem

**Customer problem.** Adults who discover GoodCane on TikTok, probably aged around 22 and over (assumed), cannot quickly find the price, location or a simple way to order, because discovery happens on TikTok while ordering happens in a manually handled WhatsApp chat. After their first bottle there is no prompt or routine to buy again, so interest fades.

**Business problem.** GoodCane cannot see how much of its next production run is already sold before it produces, which likely causes sell-outs, wasted bottles and an uneven workload (to be confirmed). Success means more units are pre-ordered before each drop, measured by planned share and repeat-order rate over a pilot.

**One-line version.** First-time TikTok buyers have no easy way to reserve and re-reserve their drink, so GoodCane produces blind; we make the next drop easy to reserve so demand is known before it is made.

**Indicative evidence** (observed by Ryan on public TikTok and Instagram; small sample, qualitative only):
- Comments ask for location, price, contact details and where to buy. One commenter said it was their first time seeing the product.
- Customer review videos get the most views on TikTok.
- Instagram bio links to a WhatsApp catalogue with add to cart. The menu image has a "Pre-order" group marked "Delivery on the 3rd day".
- The website does not link TikTok or show a phone number.
- Review videos mention buying more than one (ambiguous: may mean quantity, not repeat purchase).

**Approach (chosen).** Scheduled pre-orders on fixed drop days, with confirm-on-payment (simulated) and a one-tap "Same again?" reorder. Reminders are an opt-in layer inside this approach, not a separate approach.

**Why not the others.** Reminders alone give intent but no commitment. Recurring delivery needs live billing, pauses and skips that cannot be shown honestly with sample data and would risk an unfinished journey.

**Scope.** B2C bottled drinks only.

**Out of scope:** stockist restocks and the frozen bagged cane (B2B), live payments, real reminder sending, recurring billing, route planning and delivery tracking, loyalty schemes and discounts, AI features, multi-shop inventory, real refunds.

**AI:** deliberately not used. The forecast is simple arithmetic that the owner can audit. Say this in the write-up.

## 3. Hard constraints (never violate)

1. **Sample data only.** No real customers, sales, stock, prices, delivery areas or payment integrations. Everything displayed that is a placeholder must be labelled "Sample" or "Demo".
2. **No live payments.** Payment is a simulation. No payment provider code, keys or SDKs.
3. **No real messages.** The app never sends WhatsApp, SMS or email. Reminders go to an outbox log; the owner "Send" action only opens a prefilled chat link. In demo mode every `wa.me` link points to `DEMO_WHATSAPP_NUMBER` (an environment variable holding the developer's own number), never to a sample customer's number or GoodCane's real number.
4. **Opt-in reminders, cancellable at any time.** Unticked by default. Opt-out is one tap.
5. **Collect only necessary data.** See section 5.8.
6. **Do not use GoodCane's real phone number, logo or artwork** anywhere. Use a plain text wordmark and keep a DEMO banner on every page.
7. **Do not display health claims or certification claims** (for example regulator approval) in the demo. Claims such as "no preservatives, no added sugar" may appear only as "GoodCane says", with a note that they are to be confirmed.
8. **Persistent banner on every page:** "DEMO: sample data, no real payments or messages".

## 4. Glossary

| Term | Meaning |
|---|---|
| **Drop** | A scheduled production run with a pickup or delivery date. The unit of planning. |
| **Lead time** | Preparation time before a drop (sample: 3 days). |
| **Cut-off** | When orders for a drop close. cut-off = drop datetime minus lead time. |
| **Capacity** | Maximum pre-order units the owner accepts for a drop (sample: 70). |
| **Hold** | A short reservation of units while a customer is paying (sample: 10 minutes). |
| **Requested** | Customer submitted an order but has not paid. Uses no capacity. Counts as "likely" demand. |
| **Paid and confirmed** | Simulated payment succeeded and capacity check passed. Firm demand. Uses capacity. |
| **Planned demand** | Orders placed through the app. |
| **Unplanned demand** | Walk-ins, first-timers and off-app orders (WhatsApp chat, calls). |
| **Unplanned buffer** | Extra units made to cover unplanned demand. |
| **Planned share** | Pre-ordered units divided by total units sold in a drop. Headline predictability measure. |
| **Turned-away units** | Units customers wanted but could not get because the drop was full. |
| **Batch card** | The customer's private page showing their orders, reorder, cancel and reminder settings. |
| **Private link** | A personal URL to the batch card. Works like a key. |
| **Checkpoint** | The fixed moment (sample: 3 days before cut-off) at which the forecast is recorded for accuracy scoring. |

## 5. Business rules (all testable)

All sample values below are owner settings stored in the `settings` table, never hard-coded.

### 5.1 Drops
- **BR-D1** The owner sets drop days (sample: Tuesday and Friday), lead time (sample: 3 days), capacity (sample: 70), hold minutes (sample: 10), request expiry (2 days), buffer setting, delivery areas and fees, pickup window.
- **BR-D2** cut_off_at = drop_at minus lead_time. Example: a Friday drop closes on Tuesday; a Tuesday drop closes on Saturday.
- **BR-D3** Orders are accepted only while now is before cut_off_at and the drop status is `open`.
- **BR-D4** After cut-off the drop is `closed`. The customer sees the next open drop with its cut-off and can reserve for it ("missed it" screen).
- **BR-D5** Drops are generated ahead (next 4 per the schedule). Statuses: `open`, `closed`, `completed`.
- **BR-D6** Time zone: store UTC, display Africa/Accra.

### 5.2 Capacity and holds
- **BR-C1** Capacity counts weighted units. Each menu item has an integer `capacity_weight` (sample: 330ml = 1, 500ml = 1, 2L = 6, 4L = 12).
- **BR-C2** available = capacity minus paid_confirmed units minus active hold units.
- **BR-C3** Pickup and delivery share one pool.
- **BR-C4** Availability check and hold creation happen in one database transaction. Concurrent customers must never oversell.

### 5.3 Order lifecycle (confirm-on-payment)

| State | Meaning |
|---|---|
| `requested` | Submitted, unpaid. Uses no capacity. |
| `paid_confirmed` | Paid (simulated) and confirmed. Uses capacity. |
| `fulfilled` | Handed over or delivered. |
| `cancelled` | Cancelled by customer or owner. |
| `expired` | System: unpaid after the earlier of 2 days from creation or the cut-off. |

- **BR-O1** Starting payment creates a hold for hold_minutes if available is at least the order weight. Otherwise run the full-drop flow (5.5).
- **BR-O2** On payment success, in one transaction, re-check availability (holds belonging to this order count as available to it). If OK, set `paid_confirmed` and `paid_at` and clear the hold. If not, run the full-drop flow and do not change state.
- **BR-O3** `fulfilled` is set only by the owner and only from `paid_confirmed`.
- **BR-O4** Cancelling a `paid_confirmed` order releases capacity and sets `refund_due = true` (owner action; no real money moves in the demo).
- **BR-O5** Every state change writes a row to `order_history` (from, to, by whom, time).
- **BR-O6** Delivery orders need an address and a sample area chosen from the owner's list and add the owner's sample fee. Pickup orders need neither.
- **BR-O7** A confirmation-mode setting exists: "On payment" (default) or "By owner" (fallback if live payment is not approved in a pilot). P2 to build the "By owner" path; design must not prevent it.

### 5.4 Simulated payment
- **BR-P1** The payment screen is labelled "Demo payment, no real money" and offers three outcomes: success, failed, no response.
- **BR-P2** The buttons call `POST /api/payments/simulate`, which behaves like a provider callback.
- **BR-P3** Each payment attempt has a unique reference. Processing is idempotent: a repeated reference returns the stored result and changes nothing.
- **BR-P4** Failed or no response keep the hold until it expires and allow retry.
- **BR-P5** If the hold has expired, disable Pay and offer "Refresh availability".

### 5.5 Cancellation and full drop
- **BR-X1** Cancelling requires an explicit confirmation dialog that says what will happen.
- **BR-X2** Two separate controls: "Cancel this order" and "Stop reminders". They never share a button.
- **BR-X3** Customers can cancel until cut-off. After cut-off only the owner can cancel.
- **BR-X4** (P2) Short undo after cancelling (sample: 30 seconds) restores the order if capacity is still available.
- **BR-F1** When available is less than wanted, ask first. Options: move to the next open drop, join the waitlist (P2), or cancel. **Never move a customer silently.**
- **BR-F2** Record a `turned_away` row (units wanted, reason) whenever a customer cannot be served in the drop they wanted, whatever they then choose.
- **BR-F3** (P2) Waitlist is first come first served. The owner is shown it; nothing converts automatically.

### 5.6 Identity, private link and sessions
There are no passwords. All access uses random tokens whose hashes are stored, never the raw value.

- **BR-L1** `access_tokens` has kinds: `link` (long-lived private link), `session` (one per device, held in a cookie), `reminder` (P1: one per reminder, expires at that drop's cut-off).
- **BR-L2** Tokens are 32 random bytes, base64url. Store only the SHA-256 hash.
- **BR-L3** Opening `/c/{token}` or `/r/{token}` validates the hash, expiry and revocation, then creates a `session` token and sets it as a cookie (HttpOnly, Secure, SameSite=Lax, sliding 90 days, sample). The cookie is how the same browser is recognised (primary route 1).
- **BR-L4** On first order create the customer and a `link` token. Show the raw link **once**, on the batch card confirmation (C6), with Copy, Send to my WhatsApp (share sheet) and Add to home screen.
- **BR-L5** Every reminder message the owner sends includes a fresh `reminder` link (primary route 2).
- **BR-L6** Owner action "Send new link" creates a new `link` token, revokes the old one and opens a prefilled chat. The owner never sees raw tokens that were issued earlier.
- **BR-L7** Order history is shown only with a valid token or session. **Never show history because someone typed a phone number.**
- **BR-L8** Show masked phone numbers (last 3 digits) on customer screens.

### 5.7 Reminders and consent
- **BR-R1** Opt-in appears on C6, after payment success, not in checkout. Fields: channel (WhatsApp, SMS, None) and "How often should we remind you?" (every drop, every second drop, monthly). Nothing is preselected; None is a real, equal option.
- **BR-R2** Every opt-in or opt-out is an append-only row in `consent_events` (customer, action, channel, frequency, time, source).
- **BR-R3** The app never sends. A due reminder creates a `reminders` row with status `queued`. The owner presses Send, which opens a prefilled `wa.me` chat (SMS: show text to copy), and the row becomes `sent`.
- **BR-R4** Reminder due time: a sample number of days before cut-off (sample: 2) for the customer's chosen frequency.
- **BR-R5** **One chase maximum:** at most one reminder per customer per drop. If there is no reply and no order, do not send another for that drop.
- **BR-R6** If an opted-in customer has not started a chat 24 hours after opting in, show the owner a single optional "confirm" nudge, at most once per opt-in event. (Reminders slice: this needs its own column, probably `customers.confirm_nudge_sent_at`; not in the first migration.)
- **BR-R7** The reminder queue query must exclude: opted out, channel None, inactive for the retention period, deleted, already ordered for that drop, reminder already sent for that drop. Enforce this in the query, not only in the UI.
- **BR-R8** "Stop reminders" writes an opt-out event immediately. Resubscribe is available only to the customer, on C9, and is a fresh explicit opt-in. The business can never re-enable it.

### 5.8 Data collected and retention

| Data | When | Why |
|---|---|---|
| First name | Always | Hand-over, personalised screens |
| Phone number | Always | Orders and opted-in reminders |
| Order history | Automatic | Reorder and demand view |
| Reminder channel and frequency | Optional | Opt-in |
| Delivery address | Delivery orders only | Fulfilment |
| Consent events | Automatic | Proof of consent |

Nothing else: no email, date of birth, precise location, advertising identifiers or analytics trackers.

- **BR-DP1** Inactive means no order and no change to reminder settings for 6 months (a session opening does not count). After that, delete first name, phone, address and tokens, set `deleted_at`, and keep orders anonymised so metrics survive.
- **BR-DP2** C9 offers "Delete my data now", with confirmation, performing the same purge immediately.
- **BR-DP3** Implement as a pure function `purgeInactiveCustomers(now)` run by `pnpm retention` and covered by tests.
- **Note for the write-up:** designed with the principles of Ghana's Data Protection Act, 2012 (Act 843) in mind. GoodCane, as the data controller, must confirm its registration with the Data Protection Commission and its compliance. This is not legal advice. Sources: https://ghalii.org/akn/gh/act/2012/843 and https://dataprotection.org.gh

### 5.9 Forecast and demand view
Implemented as pure, tested functions in `server/domain/forecast`.

- **BR-FC1 Demand units** for a closed drop = paid_confirmed units + turned-away units. Use demand units for all history, otherwise capped drops understate demand.
- **BR-FC2 Baseline:** weighted moving average of the last 4 closed drops' demand units, weights 1, 2, 3, 4 (newest highest). Fixture: 40, 44, 50, 52 gives 48.6.
- **BR-FC3 Pace table:** from closed drops, using `paid_at`, compute the cumulative share of final planned units already paid by each day before cut-off (5, 4, 3, 2, 1, 0), averaged across drops. Seed shape: 20%, 35%, 60%, 80%, 92%, 100%.
- **BR-FC4 Pace projection** at day d = paid units now divided by pace share at day d. Fixture: 30 paid at 60% gives 50; 30 at 40% gives 75.
- **BR-FC5** Use the baseline when there are fewer than 4 closed drops; otherwise the headline projection is the pace projection, with the baseline shown for comparison.
- **BR-FC6 Likely tier** = open requested units multiplied by the request-to-paid conversion rate from closed drops (fallback sample 0.7 with fewer than 3 closed drops). Always shown separately from Paid.
- **BR-FC7 Range:** projection plus or minus the recent error band (fallback plus or minus 10%). Show as "about 45 to 55".
- **BR-FC8 Unplanned buffer** from the last up to 5 closed drops' unplanned sold: Careful with waste = lowest, Balanced = average (rounded), Never sell out = highest. Default **Balanced**. With fewer than 3 closed drops show a sample default with "Low confidence".
- **BR-FC9 Suggested production** = round(projected planned units + buffer). The owner always decides.
- **BR-FC10 Snapshots:** at the checkpoint (sample: 3 days before cut-off) store the projection in `forecast_snapshots`.
- **BR-FC11 Accuracy:** actual = final demand units at cut-off. Report MAPE, WAPE, bias and the naive benchmark (forecast = previous drop's actual), with the number of scored drops. Score only drops that have a pace snapshot.
  - MAPE = average of absolute error divided by actual.
  - WAPE = sum of absolute errors divided by sum of actuals.
  - Bias = average of signed error divided by actual.
  - Test fixture (forecast, actual): (50, 46), (44, 50), (58, 52), (47, 48), (55, 50). Expected MAPE about 8.9%, WAPE about 8.9% (22 over 246), bias about +3.2%, naive benchmark about 6.1% on drops 2 to 5.
- **BR-FC12 Planned share** = pre-ordered units divided by (pre-ordered units plus unplanned sold).
- **Honesty rule:** the demo forecast learns from seeded data, so it proves the mechanism, not real accuracy. Say so on the metrics page and in the write-up.

### 5.10 Close batch
- **BR-B1** The owner enters units made and unplanned sold. Wasted is optional.
- **BR-B2** The system knows orders sold. Identity: units_made = orders_sold + unplanned_sold + wasted.
- **BR-B3** If wasted is omitted, calculate it. If all are entered and the identity fails, show a non-blocking warning with the difference.

## 6. Screens

A persistent DEMO banner appears on all pages. Mobile first: single column at 360px width, primary actions anchored at the bottom, tap targets at least 44px.

### 6.1 Customer screens

| # | Screen | Contents | Priority |
|---|---|---|---|
| C1 | **Landing: "This drop"** | Next drop date, cut-off countdown, taste picker (Sweet, Spicy, Sour), sample reviews labelled "Sample review", "GoodCane says" claims note, hours and pickup placeholder. Recognised returning customers see "Welcome back, {first name}. Same again?" | P0 |
| C2 | **Build order** | Flavour, size, quantity stepper, spaces left, sticky total bar. Hide sold-out items; never dead-end | P0 |
| C3 | **Your details** | First name, phone, Pickup or Delivery toggle (delivery reveals address, sample area, sample fee) | P0 |
| C4 | **Review and pay** | Summary, hold countdown, demo payment notice | P0 |
| C5 | **Simulated payment** | Success, failed, no response. Retry keeps the hold | P0 |
| C6 | **Batch card (confirmation)** | "Paid and confirmed", pickup or delivery details, private link with Copy, Send to my WhatsApp, Add to home screen, then the reminder opt-in | P0 |
| C7 | **Same again?** | See 6.3. The flawless screen | P0 |
| C8 | **Edge states** | Drop closed (next drop), drop full (move, waitlist, cancel), hold expired, lost link (message GoodCane) | P0 for closed, full and hold expired; P1 for the rest |
| C9 | **Manage** | Order history, cancel order (confirm dialog), reminder settings, stop reminders, resubscribe, delete my data | P1 |
| C0 | **About this demo** | What is real versus simulated, assumptions register, data practices, links | P1 |

### 6.2 Owner screens (behind a demo passcode)

| # | Screen | Contents | Priority |
|---|---|---|---|
| O1 | **This drop (demand view)** | Paid versus Requested tiers in different colours, projection and range, buffer setting, suggested production, spaces left, turned-away units, planned share, cut-off countdown | P0 |
| O2 | **Orders** | Filter by drop and status, mark fulfilled, cancel, refund-due flag | P0 |
| O3 | **Close batch** | Rule set 5.10 | P1 |
| O4 | **Settings** | All sample values in 5.1 and the confirmation mode, menu and prices, delivery areas and fees | P1 |
| O5 | **Reminder queue** | Due today, one-chase rule, Send opens prefilled chat, marks sent, optional 24-hour nudge | P1 |
| O6 | **Metrics** | Planned share trend, weekly confirmed orders, repeat-order rate, cancellations and expiries, payment completion rate, forecast versus actual with naive benchmark | P2 (the four required metrics must still exist as numbers on O1 or O6) |
| O7 | **Customers** | Masked phones, Send new link, delete | P2 |

### 6.3 C7 "Same again?" acceptance criteria (must all pass)
1. Opens with no typing, from a private link, a reminder link or a recognised cookie.
2. Next drop date, cut-off and spaces left are visible without scrolling.
3. "Your usual" is prefilled from the last paid order. Two taps from opening to the payment screen (open, then Pay). Quantity can be changed inline.
4. Edge cases each have a next step: usual item unavailable (offer the nearest flavour in the same taste group), price changed (show clearly), drop full (ask first), drop closed (show next drop), hold timer visible.
5. Page is light and loads in about 3 seconds on a mid-range phone on a weak connection (assumed target).
6. Three people who have never seen it complete it on a phone with no instructions. Record the times for the write-up.

### 6.4 Menu and brand (sample)
- Mirrors the public menu as observed (to be confirmed): taste groups Sweet (raw cane, passionfruit cane), Spicy (ginger-lemon cane), Sour (lemon-mint cane, lemon-charcoal cane), and "Drop special" tag for tigernut-coconut cane, cucumber cane and passionlemon cane.
- Main flow sizes: 330ml and 500ml. Group sizes (2L, 4L) as a P2 "Group order" option.
- Prices are samples, shown with "Sample price". Currency format GH₵ with integer pesewas in the database.
- Visual direction: green and cream, friendly and bold, text wordmark only. British English copy. No em dashes.
- Sample reviews are invented, labelled, and use placeholder names. Never copy real customer reviews.

## 7. Data model (conceptual)

Every table that holds sample data has `is_sample boolean`. In `DEMO_MODE` every row the app creates is flagged `is_sample = true`, so a reseed fully resets the demo.

| Table | Key fields |
|---|---|
| **settings** | key, value |
| **drops** | id, drop_at, cut_off_at, capacity, status, units_made, unplanned_sold, units_wasted, closed_at |
| **menu_items** | id, name, taste_group, size, price_pesewas (sample), capacity_weight, is_special, active |
| **customers** | id, first_name, phone (indexed, not unique: the same phone may belong to several customer records), reminder_channel, reminder_frequency, last_active_at, deleted_at |
| **access_tokens** | id, customer_id, kind (link, session, reminder), token_hash, expires_at, revoked_at, drop_id (nullable) |
| **consent_events** | id, customer_id, action (opt_in, opt_out), channel, frequency, source, created_at (append-only) |
| **orders** | id, customer_id (nullable after purge), drop_id, status, fulfilment, address, area, fee_pesewas, total_pesewas, hold_expires_at, created_at, paid_at, refund_due |
| **order_items** | order_id, menu_item_id, quantity, unit_price_pesewas |
| **payments** | id, order_id, reference (unique), outcome, created_at |
| **reminders** | id, customer_id, drop_id, channel, status (queued, sent), sent_at |
| **turned_away** | id, drop_id, units, reason, created_at |
| **order_history** | id, order_id, from_status, to_status, actor, created_at |
| **forecast_snapshots** | id, drop_id, checkpoint_at, method (baseline, pace), projected_units |

Rules enforced on the server (not only in screens): capacity inside one transaction; each payment reference processed once; the reminder queue excludes anyone ineligible (BR-R7); planned share and forecasts are calculated, not stored.

In any raw SQL, put double quotes around table and column names.

## 8. Tech stack and architecture

| Layer | Choice |
|---|---|
| App | Nuxt (current stable, Vue 3, TypeScript strict), full stack via server routes |
| Styling | Tailwind CSS with Nuxt UI |
| Database | PostgreSQL on Supabase or Neon |
| Data access | Drizzle ORM and migrations |
| Validation | Zod at every server boundary |
| Charts | Chart.js |
| Tests | Vitest |
| PWA | Installable (home screen icon), minimal offline shell |
| Deploy | Vercel or Netlify from GitHub |
| Package manager | pnpm |

Check the official docs for current Nuxt, Tailwind and Drizzle conventions before generating configuration. Do not rely on memory.

Suggested layout:
```
app/            pages, components, composables
server/api/     thin route handlers: validate, call domain, return JSON
server/domain/  pure business logic: drops, capacity, orders, forecast, retention
server/db/      schema, migrations, seed
tests/
docs/           this spec
```

Business logic lives in `server/domain` as pure functions with unit tests. Components contain no business rules.

Environment variables (`.env.example` committed, real `.env` never): `DATABASE_URL`, `DEMO_MODE=true`, `DEMO_WHATSAPP_NUMBER`, `OWNER_PASSCODE`, `APP_URL`.

Key endpoints (indicative):

| Endpoint | Purpose |
|---|---|
| `GET /api/drops/next` | Next open drop, spaces left |
| `POST /api/orders` | Create a `requested` order. Use the customer from the valid session, otherwise create a new customer and link. Never look up a customer by phone at order time (it would expose their history, BR-L7) |
| `POST /api/orders/:id/pay-start` | Create hold |
| `POST /api/payments/simulate` | Simulated provider callback |
| `GET /api/me` | Customer from session cookie |
| `POST /api/orders/:id/cancel` | Cancel with confirmation flag |
| `POST /api/reminders/optin`, `/optout` | Consent events |
| `GET /api/owner/drop/:id/demand` | Demand view numbers |
| `POST /api/owner/drop/:id/close` | Close batch |

Security basics: HTTPS only, Zod validation, simple rate limit on order creation, HTML escaping, never log phone numbers or tokens, owner routes behind a passcode session (demo only; a real pilot needs proper owner accounts), seed is a CLI script and not an endpoint.

## 9. Seed data (`pnpm seed`)

Idempotent: inside one transaction delete rows where `is_sample` is true (children before parents), then insert. Uses a fixed random seed so every run is identical (with the same `now`, floored to the hour). Dates are relative to now and ignore the `drop_days` setting on purpose.

- **Dates:** the live drop's cut-off is now plus 3 days and its drop is 3 days after that; the further open drop is 4 days later. The newest completed drop is 7 days before the live drop (the slot in between is skipped so every completed drop is really in the past), then completed drops step back alternately 3 and 4 days.
- **8 past completed drops**, planned units gently growing roughly from 38 to 56 with noise. One drop hit capacity: the newest completed drop has a sample capacity of 50 (the others 70), demand of about 56, and turned-away rows for the excess.
- **40 sample customers** (matching the pilot size in section 10) named "Sample Customer 01" to "Sample Customer 40", with obviously fake phone values 0000000001 to 0000000040. Each customer is created by their first order, never matched by phone. About 40% order on several drops. Each has a stored "usual" via their last order.
- **Order arrival times** follow the pace curve. Convert the cumulative table (5 days: 20%, 4: 35%, 3: 60%, 2: 80%, 1: 92%, 0: 100%) into the share arriving each day (20, 15, 25, 20, 12, 8) and pick each order's day by weighted random choice (`pickDay`). Day d means the 24-hour bucket from cut-off minus (d+1) days up to cut-off minus d days. Add small per-drop noise so no two drops are identical.
- **Statuses:** mostly fulfilled, about 5 to 8% cancelled (all with `refund_due`, BR-O4), and some requests expired unpaid (so the request-to-paid rate is realistic). Every status change has an `order_history` row; every paid order has a payment row.
- **Close batch numbers** per past drop: unplanned sold between about 8 and 16, small waste, and made = orders sold + unplanned + wasted.
- **Live upcoming drop** about 3 days before cut-off with about 30 paid units and about 10 requested units, plus one further open drop with a few paid orders and no requests.
- **A few opted-in reminders** across channels and frequencies and a few outbox rows. Nothing is ever sent.
- **Not seeded yet:** `access_tokens` and `forecast_snapshots`.
- **Verification step** inside the same transaction (any failure rolls everything back): row counts, 12 settings, the made-equals-sold identity, and that the learned pace table is within 8 percentage points of the one used to generate the data. Drops that hit capacity are left out of the learned pace table, because turning customers away cuts off the late orders and would skew the shape.
- **Later (C6/C7 slice, not built yet):** a "Demo Customer A" with a fixed, printed sample link, so the demo video is repeatable.

## 10. Measurement (summary; full plan is deliverable 4)

| Metric | Formula |
|---|---|
| Repeat-order rate | Eligible customers with a paid order on a later drop divided by eligible customers (eligible = first paid order early enough to allow a reorder) |
| Confirmed weekly orders | Orders with status paid_confirmed or fulfilled, per week of drop date (orders and units) |
| Cancellation rate | Customer-cancelled paid orders divided by paid orders. Also report expiry rate and reminder opt-out rate separately |
| Forecast accuracy | MAPE, WAPE, bias and naive benchmark at the checkpoint (BR-FC11) |
| Planned share | Pre-ordered units divided by total units sold |
| Payment completion rate | Paid orders divided by requested orders |
| Reminder to reorder | Reminders followed by an order before that drop's cut-off divided by reminders sent |
| Median days between orders | Middle gap between a customer's orders |
| Waste rate, sell-outs, turned-away units | From Close batch and `turned_away` |

Pilot (assumed, to agree with GoodCane): 4 weeks, 8 drops, about 40 invited customers after a Week 0 for assumptions and baseline. Draft thresholds are placeholders: repeat-order rate continue at 30% or more, stop under 15%; planned share continue at 40% or more and rising, stop under 25% or flat; cancellation plus expiry rate continue at 10% or less, stop over 20%; forecast MAPE continue at 15% or less, stop over 30%; owner effort continue at 15 minutes a day or less, stop over 30.

Threats to state: small sample, novelty effect, selection bias (opted-in customers are probably keener), seasonality, social media spikes.

## 11. Testing and definition of done

Unit tests (Vitest) with the fixtures in this spec:
- Forecast: weighted average 48.6; pace 30 over 0.6 = 50 and 30 over 0.4 = 75; MAPE, WAPE, bias and naive benchmark fixture.
- Cut-off maths: Friday drop with 3-day lead time closes Tuesday.
- Capacity and holds: concurrent requests never oversell; expired holds return units.
- Lifecycle: allowed and forbidden transitions; cancelling a paid order sets `refund_due`.
- Payment idempotency: the same reference twice changes state once.
- Reminder queue exclusions (BR-R7) and the one-chase rule.
- Retention purge (BR-DP1) keeps anonymised orders.
- Close batch identity and warning.

A feature is done when: it works on a 360px phone, handles loading, empty and error states, has tests for its business rules, matches the spec, and the DEMO labelling is intact.

Priority order: finish C1 to C7 and O1 and O2 first (P0). Cut order when behind: O6 metrics page, waitlist, delivery layer, Send new link, then the reminder queue.

## 12. Demo video storyboard (about 3 minutes)
1. Customer A scans the bottle QR card, picks a flavour, pays in the demo, saves the link, opts in to reminders (C1 to C6).
2. Cut to the owner: the Paid tier rises and the projection and suggested production update (O1).
3. Time passes (seeded later state): Customer A taps the reminder link, sees "Same again?", pays (C7).
4. Owner reviews the reminder queue, planned share and repeat-order rate, then Close batch (O5, O6, O3).

## 13. Submission checklist
- Public repository with README (setup, `pnpm seed`, `.env.example`, demo credentials for the owner passcode).
- Deployed demo link.
- Video link.
- Written explanation (deliverable 3) and measurement plan (deliverable 4).
- Rubric coverage map: one table of rubric item, where answered, what in the demo proves it.
- Built versus designed list and honest limitations.

## Appendix A: Assumptions register

**Confirm with GoodCane before any pilot (no contact has been made; these are stated, not verified):**
- A1 Orders arrive via the WhatsApp catalogue, calls and DMs; the channel split is unknown.
- A2 What "Delivery on the 3rd day" means and which flavours it covers.
- A3 Whether the WhatsApp catalogue is current (pre-order flavours missing, "menu" item present).
- A4 Whether bottled drinks are frozen, and the usable shelf life once thawed.
- A5 Which pain matters most: waste, sell-outs, production workload or cash tied up.
- A6 Production capacity per day.
- A7 Main shop hours, location, delivery areas and fees, pickup options.
- A8 How payment is taken today.
- A9 Current prices (observed: 330ml 35, 500ml 45, 2L 180, 4L 260 cedis).
- A10 Which flavours are core versus seasonal.
- A11 Exact wording and evidence for product claims.
- A12 Stockist restocks and frozen bagged cane are B2B and out of scope.
- A25 GoodCane approves a payment provider if live payment is used in a pilot.
- A26 GoodCane confirms its Data Protection Commission registration and any record-keeping duties.

**Test in the pilot:**
- A13 The audience is mainly adults around 22 and over.
- A14 Comments asking for location and price represent lost orders.
- A15 Review videos drive discovery and trust.
- A16 "Bought more than one" means repeat buying.
- A17 Customers will pre-order before production if trust signals are present.
- A18 Customers will opt in to reminders, and WhatsApp is preferred.
- A19 Discovery on TikTok and ordering on WhatsApp are disconnected.
- A20 Orders arrive in a predictable pattern before each cut-off.
- A21 The owner will enter Close batch numbers consistently.
- A22 The owner will work a daily queue and send reminders manually.
- A23 Unplanned demand is stable enough to size a buffer.
- A24 Rising planned share signals more predictable demand, not just fewer walk-ins.
