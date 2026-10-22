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

1. **Sample data only.** No real customers, sales, stock, prices, delivery areas or payment integrations. The disclosure is one place, the Demo data button (rule 8), not a label on each placeholder (decision 18 Oct 2026). Exceptions kept on purpose: the payment screens say "No money is taken" (BR-P1), and the owner metrics keep the honesty note (5.9).
2. **No live payments.** Payment is a simulation. No payment provider code, keys or SDKs.
3. **No real messages.** The app never sends WhatsApp, SMS or email. Reminders go to an outbox log; the owner "Send" action only opens a prefilled chat link. In demo mode every `wa.me` link points to `DEMO_WHATSAPP_NUMBER` (an environment variable holding the developer's own number), never to a sample customer's number or GoodCane's real number.
4. **Opt-in reminders, cancellable at any time.** Unticked by default. Opt-out is one tap.
5. **Collect only necessary data.** See section 5.8.
6. **Do not use GoodCane's real phone number, logo or artwork** anywhere. Use a plain text wordmark and keep the Demo data button on every page.
7. **Do not display health claims or certification claims** (for example regulator approval) in the demo. Claims such as "no preservatives, no added sugar" may appear only as "GoodCane says", with a note that they are to be confirmed.
8. **Disclosure on every page:** a sticky **Demo data** button on every page that opens a dialog saying everything is demo data (made-up drinks, prices, locations and customers; no real orders, payments or messages; a prototype, not GoodCane's shop).

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
- **BR-D1** The owner sets drop days (sample: Tuesday and Friday), lead time (sample: 3 days), capacity (sample: 70), hold minutes (sample: 10), request expiry (2 days), buffer setting, delivery areas and fees (each area has a stable `id`, a name and a fee in pesewas), pickup window.
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

A request past that limit is **lapsed**. Until a job writes the `expired` status, the rule is applied on read (`isRequestLapsed` in `server/domain/orders/requests.ts`): screens show a lapsed request as lapsed. Every query that reads requests (the Likely tier on O1, the O2 orders list) must exclude lapsed requests using the same rule. To be built with O1.

- **BR-O1** Starting payment creates a hold for hold_minutes if available is at least the order weight. Otherwise run the full-drop flow (5.5).
- **BR-O2** On payment success, in one transaction, re-check availability (holds belonging to this order count as available to it). If OK, set `paid_confirmed` and `paid_at` and clear the hold. If not, run the full-drop flow and do not change state. A success after the hold expired is re-checked the same way. At or after the cut-off, an active hold taken before the cut-off is honoured; without an active hold the result is `drop_closed`. A success that cannot be confirmed stores the payment with `result = not_confirmed`, its reason and `refund_due = true` (no real money moves in the demo), and the customer is told no order was made.
- **BR-O3** `fulfilled` is set only by the owner and only from `paid_confirmed`.
- **BR-O4** Cancelling a `paid_confirmed` order releases capacity and sets `refund_due = true` (owner action; no real money moves in the demo).
- **BR-O5** Every state change writes a row to `order_history` (from, to, by whom, time). A hold is not a state change: `hold_expires_at` records it and no history row is written.
- **BR-O6** Delivery orders need an address and a sample area chosen from the owner's list and add the owner's sample fee. Pickup orders need neither.
- **BR-O7** A confirmation-mode setting exists: "On payment" (default) or "By owner" (fallback if live payment is not approved in a pilot). P2 to build the "By owner" path; design must not prevent it.
- **BR-O8** When a session places a new order on a drop, that session's older orders on the same drop in status `requested` without an active hold become `expired` (actor `system`, with an `order_history` row), in the same transaction. Paid or fulfilled orders and orders with an active hold are never touched.
- **BR-O10** A session may hold at most 3 open requests (status `requested`, not lapsed, any drop). A new order beyond that is refused with 409 `too_many_open_requests` and nothing is stored. Abuse protection for a public demo; the limit is a constant, not an owner setting.
- **BR-O9** Creating an order (`POST /api/orders`) reserves nothing: it checks the cut-off by server time and does an advisory capacity check (BR-C2), then stores a `requested` order with no hold. Prices, weights and fees are read from the database, never from the client. A client-generated idempotency key makes a repeated submission return the same order instead of creating a second one.

### 5.4 Simulated payment
- **BR-P1** The payment screen says "No money is taken" and offers three outcomes: success, failed, no response.
- **BR-P2** The buttons call `POST /api/payments/simulate`, which behaves like a provider callback.
- **BR-P3** Each payment attempt has a unique reference. Processing is idempotent: a repeated reference returns the stored result and changes nothing. The stored result is `payments.result` (`confirmed`, `not_confirmed` or `hold_kept`) with `payments.reason`; the reference is made by the client for each attempt. A reference already used for another order or session returns a conflict and reveals nothing.
- **BR-P4** Failed or no response keep the hold until it expires and allow retry.
- **BR-P5** If the hold has expired, disable Pay and offer "Refresh availability".

### 5.5 Cancellation and full drop
- **BR-X1** Cancelling requires an explicit confirmation dialog that says what will happen.
- **BR-X2** Two separate controls: "Cancel this order" and "Stop reminders". They never share a button.
- **BR-X3** Customers can cancel until cut-off. After cut-off only the owner can cancel.
- **BR-X4** (P2) Short undo after cancelling (sample: 30 seconds) restores the order if capacity is still available.
- **BR-F1** When available is less than wanted, ask first. Options: move to the next open drop, join the waitlist (P2), or cancel. **Never move a customer silently.**
- **BR-F2** Record a `turned_away` row (units wanted, reason) whenever a customer cannot be served in the drop they wanted, whatever they then choose. One row per order (`turned_away.order_id` is unique), written by `pay-start` or by a payment success that cannot be confirmed, so retries do not inflate demand. The forecast must ignore `turned_away` rows whose customer later has a `paid_confirmed` order on the same drop, to avoid counting one person twice. "Later" is strict (fixed 22 Oct 2026): only an order paid **after** the row was recorded hides it (paid now on O1; paid by the checkpoint in a snapshot). An order paid before the row does not: a customer who already had bottles and was turned away when asking for more is extra demand and counts. To be built with O1. **A completely full drop (22 Oct 2026):** C2's full state asks "How many bottles did you want?" (stepper) and offers "Join {next drop}" and "No thanks, just let GoodCane know". Either one writes a `turned_away` row (units, reason `drop_full`) through `POST /api/orders/turned-away`; only "Join" then switches to the next drop (BR-F1: nobody is moved silently). No order, hold or customer is created. The server refuses unless the drop is open, before cut-off and really has no room for those units. The row carries the session's customer when there is one (`turned_away.customer_id`), so the dedupe above still works, and a client idempotency key (one per drop per browser, kept in localStorage with an in-memory fallback, `turned_away.idempotency_key` unique), so taps and reloads write one row. Anonymous visitors (no session) cannot be deduplicated and can add rows up to the `/api/orders` rate limit with new keys; that is acceptable only because all data is sample data, and a live service would need a stronger limit. C7 is unchanged.
- **BR-F3** (P2) Waitlist is first come first served. The owner is shown it; nothing converts automatically.

### 5.6 Identity, private link and sessions
There are no passwords. All access uses random tokens whose hashes are stored, never the raw value.

- **BR-L1** `access_tokens` has kinds: `link` (long-lived private link), `session` (one per device, held in a cookie), `reminder` (P1: one per reminder, expires at that drop's cut-off).
- **BR-L2** Tokens are 32 random bytes, base64url. Store only the SHA-256 hash.
- **BR-L3** Opening `/c/{token}` or `/r/{token}` validates the hash, expiry and revocation, then creates a `session` token and sets it as a cookie (HttpOnly, Secure, SameSite=Lax, sliding 90 days, sample). The cookie is how the same browser is recognised (primary route 1). A `link` token has no expiry and works every time it is opened until revoked; opening it lands on C7 "Same again?" when the customer has a paid order and a drop is open ahead, otherwise on C1 with a short welcome message. An invalid link lands on a plain "this link no longer works" page.
- **BR-L4** On first order create the customer and a `session` token. The `link` token is created on the batch card confirmation (C6), the only place its raw value is shown, **once**, with Copy, Send to my WhatsApp (share sheet) and Add to home screen. (Only hashes are stored, so the link cannot be created earlier and shown later.) **One exception, demo mode only:** the seed creates "Demo Customer A" (section 9) with a fixed, published private link, so the video and reviewers reach C7 in one tap. It exists only when the seed runs with `DEMO_MODE` on, belongs to a sample customer only, is stored as a hash like every token, and is rebuilt on every reseed. It is never created outside demo mode. "Delete my data now" or O7 "Send new link" on this customer kills the link until the next reseed.
- **BR-L9** Phone numbers are Ghana numbers stored as `+233` followed by 9 digits. Accepted input: `0XXXXXXXXX` or `+233XXXXXXXXX`, with spaces and hyphens ignored. Anything else is rejected with a clear message. No network-prefix check (sample data only).
- **BR-L5** Every reminder message the owner sends includes a fresh `reminder` link (primary route 2): `{APP_URL}/r/{token}`, a `reminder` token for that drop, hashed, expiring at that drop's cut-off. Opening it works like `/c/{token}` (BR-L3: session cookie, then C7 or C1); a wrong, expired or revoked token, or a deleted customer, lands on the link-invalid page and sets no cookie.
- **BR-L6** Owner action "Send new link" creates a new `link` token, revokes the old one and opens a prefilled chat. The owner never sees raw tokens that were issued earlier.
- **BR-L7** Order history is shown only with a valid token or session. **Never show history because someone typed a phone number.**
- **BR-L8** Show masked phone numbers (last 3 digits) on customer screens.
- **BR-L10** On C6 the customer can make a new private link (for example after losing the one shown once). This revokes their previous link: the customer-side counterpart of BR-L6.

### 5.7 Reminders and consent
- **BR-R1** Opt-in appears on C6, after payment success, not in checkout. Fields: channel (WhatsApp, SMS, None) and "How often should we remind you?" (every drop, every second drop, monthly). Nothing is preselected; None is a real, equal option. Frequency is asked only after WhatsApp or SMS is chosen. Choosing None writes an `opt_out` row with channel `none` and sets the customer's channel to `none`. Opt-in and opt-out count as activity for BR-DP1.
- **BR-R2** Every opt-in or opt-out is an append-only row in `consent_events` (customer, action, channel, frequency, time, source).
- **BR-R3** The app never sends. The queue is built lazily when O5 is read, for the next open drop only (no cron): every customer the BR-R7 query allows gets a `reminders` row with status `queued` (insert, ignoring an existing row). The owner presses Send, which creates the reminder link (BR-L5), opens a prefilled `wa.me` chat to `DEMO_WHATSAPP_NUMBER` (SMS: show text to copy), and the row becomes `sent`, in one transaction. A queued row whose customer has since become ineligible (ordered, opted out, deleted) is not shown and cannot be sent.
- **BR-R4** Reminder due time: a sample number of days before cut-off (sample: 2) for the customer's chosen frequency. A reminder is **Due now** from that time until the cut-off and **Coming up** before it. Send works on Due now rows; on Coming up rows only in `DEMO_MODE`, through a button labelled "Send early (demo)". Frequency: every drop always; every second drop only when no reminder was sent for the drop just before this one; monthly only when no reminder was sent in the 28 days before this drop's due time.
- **BR-R5** **One chase maximum:** at most one reminder per customer per drop. If there is no reply and no order, do not send another for that drop. Enforced in the database (unique `customer_id, drop_id` on `reminders`), in the BR-R7 query (any existing row for the drop excludes the customer) and in Send (only a `queued` row can become `sent`).
- **BR-R6** If an opted-in customer has not started a chat 24 hours after opting in, show the owner a single optional "confirm" nudge, at most once per opt-in event. **Designed, not built** (21 Oct 2026): it needs a schema change (`customers.confirm_nudge_sent_at`), left out of the O5 slice to avoid a migration.
- **BR-R7** The reminder queue query must exclude: opted out, channel None, inactive for the retention period, deleted, already ordered for that drop, reminder already sent for that drop. Enforce this in the query, not only in the UI.
- **BR-R8** "Stop reminders" writes an opt-out event immediately. Resubscribe is available only to the customer, on C9, and is a fresh explicit opt-in. The business can never re-enable it. The customer's consent state comes from their latest consent row: none yet, declined (None), opted in, or stopped. A customer with no choice yet, or who chose None, may opt in later from a small "Reminder settings" control on C6 or C7 (a new `opt_in` row, source `c6` or `c7`). After "Stop reminders", opt-in is refused by the server unless it comes from C9 (source `c9`, session required): that is the only resubscribe path, a fresh `opt_in` row with nothing preselected. C9 may also make a first choice or turn reminders on after None, like C6 and C7. While opted in, "Stop reminders" is a one-tap control that never shares a button with any order action (BR-X2).

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
- **BR-DP2** C9 offers "Delete my data now", with confirmation, performing the same purge immediately. The dialog warns (it does not block) when the customer has an upcoming paid order. The purge (`purgeCustomer` in `server/domain/retention`, applied in one transaction, shared with BR-DP3): first name, phone and reminder choice set to null, `deleted_at` set (kept if already set, so running it twice changes nothing), every access token deleted, queued reminders deleted, and the customer's orders kept with `customer_id` null and `address` null so metrics survive. Consent events are kept as proof of consent. Afterwards the session cookie is cleared and every link stops working.
- **BR-DP3** Implement as a pure function `purgeInactiveCustomers(now)` run by `pnpm retention` and covered by tests. Built 22 Oct 2026: the pure cut-off is `inactiveCutOff(now, retention_months)` and the pure purge is `purgeCustomer` (BR-DP2); `purgeInactiveCustomers(db, now, { dryRun })` selects customers not deleted whose `last_active_at` is before the cut-off and applies the purge to each in its own transaction. `last_active_at` moves on an order, a payment or a reminder-setting change, never on opening a private or reminder link. `pnpm retention` has the same remote guard as the seed (`ALLOW_REMOTE_DB`), prints counts only (never names or phones), and `--dry-run` changes nothing. Running it twice purges nobody the second time.
- **Note for the write-up:** designed with the principles of Ghana's Data Protection Act, 2012 (Act 843) in mind. GoodCane, as the data controller, must confirm its registration with the Data Protection Commission and its compliance. This is not legal advice. Sources: https://ghalii.org/akn/gh/act/2012/843 and https://dataprotection.org.gh

### 5.9 Forecast and demand view
Implemented as pure, tested functions in `server/domain/forecast`.

- **BR-FC1 Demand units** for a closed drop = paid_confirmed units + turned-away units. Use demand units for all history, otherwise capped drops understate demand.
- **BR-FC2 Baseline:** weighted moving average of the last 4 closed drops' demand units, weights 1, 2, 3, 4 (newest highest). Fixture: 40, 44, 50, 52 gives 48.6.
- **BR-FC3 Pace table:** from closed drops, using `paid_at`, compute the cumulative share of final planned units already paid by each day before cut-off (5, 4, 3, 2, 1, 0), averaged across drops. Seed shape: 20%, 35%, 60%, 80%, 92%, 100%.
- **BR-FC4 Pace projection** at day d = demand units so far divided by pace share at day d. Demand so far = paid units plus turned-away units recorded so far (BR-F2 dedupe), so the projection and the actual it is scored against (BR-FC11) are both demand units. Fixture: 30 paid at 60% gives 50; 30 at 40% gives 75. Between whole days the share is a straight line between the two day marks (2.3 days before cut-off, between 60% at day 3 and 80% at day 2, gives 74%). More than 5 days before cut-off there is no pace data, so the pace projection is unavailable; at or after cut-off the share is 1.
- **BR-FC5** Use the baseline when there are fewer than 4 closed drops, or when it is more than 5 days before cut-off (labelled "Baseline (too early for pace)"); otherwise the headline projection is the pace projection, with the baseline shown for comparison.
- **BR-FC6 Likely tier** = open requested units multiplied by the request-to-paid conversion rate from closed drops (fallback sample 0.7 with fewer than 3 closed drops). Always shown separately from Paid.
- **BR-FC7 Range:** projection plus or minus the recent error band (fallback plus or minus 10%). Show as "about 45 to 55".
- **BR-FC8 Unplanned buffer** from the last up to 5 closed drops' unplanned sold: Careful with waste = lowest, Balanced = average (rounded), Never sell out = highest. Default **Balanced**. With fewer than 3 closed drops show a sample default with "Low confidence".
- **BR-FC9 Suggested production** = round(projected planned units + buffer). The owner always decides.
- **BR-FC10 Snapshots:** at the checkpoint (sample: 3 days before cut-off) store the projection in `forecast_snapshots`. A snapshot is always computed **as of the nominal checkpoint** (cut-off minus `forecast_checkpoint_days`), using only payments with `paid_at` at or before that moment (and not cancelled by then), turned-away rows recorded at or before it (deduped against the customers paid by then), and only drops whose cut-off is before it, so a late computation gives exactly the same result as an on-time one. It is written lazily on the first O1 load after the checkpoint, once per drop and method (idempotent), never on every page view. The seed writes past drops' snapshots with the same function.
- **BR-FC11 Accuracy:** actual = final demand units at cut-off. Report MAPE, WAPE, bias and the naive benchmark (forecast = previous drop's actual), with the number of scored drops. Score only drops that have a pace snapshot.
  - MAPE = average of absolute error divided by actual.
  - WAPE = sum of absolute errors divided by sum of actuals.
  - Bias = average of signed error divided by actual.
  - Test fixture (forecast, actual): (50, 46), (44, 50), (58, 52), (47, 48), (55, 50). Expected MAPE about 8.9%, WAPE about 8.9% (22 over 246), bias about +3.2%, naive benchmark about 6.0% on drops 2 to 5 (the same MAPE formula, error divided by actual: 4/50, 2/52, 4/48, 2/50, average 6.04%).
  - Bias is (forecast minus actual) divided by actual, so a positive bias means over-forecasting. Pairs with an actual of 0 are skipped and counted, never divided by.
  - Snapshots are taken as of the nominal checkpoint (BR-FC10), so scoring never uses data from after the checkpoint.
  - Like for like: the forecast (BR-FC4), the actual and the naive benchmark are all demand units (paid plus turned away).
- **BR-FC12 Planned share** = pre-ordered units divided by (pre-ordered units plus unplanned sold).
- **Honesty rule:** the demo forecast learns from seeded data, so it proves the mechanism, not real accuracy. Say so on the metrics page and in the write-up.

### 5.10 Close batch
- **BR-B1** The owner enters units made and unplanned sold. Wasted is optional.
- **BR-B2** The system knows orders sold. Identity: units_made = orders_sold + unplanned_sold + wasted.
- **BR-B3** If wasted is omitted, calculate it. If all are entered and the identity fails, show a non-blocking warning with the difference.
- **BR-B4** (built 22 Oct 2026, O3 at `/owner/close`) "Orders sold" is the drop's paid units (paid and confirmed, or fulfilled), from the same query as spaces left. A calculated wasted that would be negative (made less than sold plus unplanned) is refused. Closing writes units made, unplanned sold and wasted, sets status `completed` (the status the seed already uses for finished batches; `closed` keeps meaning "past cut-off", BR-D4) and `closed_at`, in one transaction with the drop row locked. It is idempotent: a drop already `completed` is never overwritten, and a repeat returns the stored numbers. It is refused before the cut-off, except in `DEMO_MODE` ("Demo: close early"), and then only while at least one other open drop remains, after a confirmation that says closing removes the drop from customers until the next reseed. Planned share (BR-FC12) then shows the exact figure, because it reads unplanned sold.

## 6. Screens

The Demo data button (constraint 8) appears on all pages. Mobile first: single column at 360px width, primary actions anchored at the bottom, tap targets at least 44px.

### 6.1 Customer screens

| # | Screen | Contents | Priority |
|---|---|---|---|
| C1 | **Landing: "This drop"** | Next drop date, cut-off countdown, taste picker (Sweet, Spicy, Sour), "GoodCane says" claims note, hours and pickup placeholder. Recognised returning customers see "Welcome back, {first name}. Same again?" | P0 |
| C2 | **Build order** | Flavour, size, quantity stepper, spaces left, sticky total bar. Hide sold-out items; never dead-end | P0 |
| C3 | **Your details** | Name (labelled "Name", stored as first name), phone, Pickup or Delivery toggle (delivery reveals address, sample area, sample fee) | P0 |
| C4 | **Review and pay** | Summary, hold countdown, "No money is taken" notice | P0 |
| C5 | **Simulated payment** | Success, failed, no response. Retry keeps the hold | P0 |
| C6 | **Batch card (confirmation)** | "Paid and confirmed", pickup or delivery details, private link with Copy, Send to my WhatsApp, Add to home screen, then the reminder opt-in | P0 |
| C7 | **Same again?** | See 6.3. The flawless screen. Returning customers skip C3 and C4: Pay places the order with their saved details (server-side) and goes straight to C5 | P0 |
| C8 | **Edge states** | Drop closed (next drop), drop full (move, waitlist, cancel), hold expired, lost link (message GoodCane) | P0 for closed, full and hold expired; P1 for the rest |
| C9 | **Manage** | Order history, cancel order (confirm dialog), reminder settings, stop reminders, resubscribe, delete my data | P1 |
| C0 | **About this demo** | What is real versus simulated, assumptions register, data practices, links; in demo mode, "Try as a returning customer" with Demo Customer A's link (BR-L4 exception) | P1 |

### 6.2 Owner screens (behind a demo passcode)

| # | Screen | Contents | Priority |
|---|---|---|---|
| O1 | **This drop (demand view)** | Paid versus Requested tiers in different colours, projection and range, buffer setting, suggested production, spaces left, turned-away units, planned share, cut-off countdown. Also: "Booked so far, by flavour" (paid and likely per flavour, lapsed requests excluded; the forecast is a total, not per flavour) and a compact "Pilot metrics" block with the four required numbers. Everything is in **units** (1 unit = one 330ml bottle; larger sizes count as more, per `capacity_weight`). For the open drop, planned share reads "45 of 60 expected units pre-ordered (estimate)", expected being suggested production; finished drops show the exact BR-FC12 figure | P0 |
| O2 | **Orders** | Filter by drop and status, mark fulfilled, cancel, refund-due flag | P0 |
| O3 | **Close batch** | Rule set 5.10 | P1 |
| O4 | **Settings** | All sample values in 5.1 and the confirmation mode, menu and prices, delivery areas and fees | P1 |
| O5 | **Reminder queue** | Next drop: Due now and Coming up (BR-R4), first name, masked phone, channel, frequency; one-chase rule; Send opens prefilled chat with a fresh reminder link and marks sent; "Send early (demo)" on Coming up in DEMO_MODE only; 24-hour nudge designed, not built (BR-R6) | P1 |
| O6 | **Metrics** | Planned share trend, weekly confirmed orders, repeat-order rate, cancellations and expiries, payment completion rate, forecast versus actual with naive benchmark | P2 (the four required metrics must still exist as numbers on O1 or O6) |
| O7 | **Customers** | Masked phones, search by first name, Send new link (shown once, with the hint "Check the last 3 digits against the number that messaged you"), delete (not built: deletion is the customer's, on C9) | P2 |

### 6.3 C7 "Same again?" acceptance criteria (must all pass)
1. Opens with no typing, from a private link, a reminder link or a recognised cookie.
2. Next drop date, cut-off and spaces left are visible without scrolling on a 360 × 640 screen, together with the usual order, the total and the bottom-anchored Pay button (a usual of more than 2 lines collapses to a summary with "Show items").
3. "Your usual" is prefilled from the last paid order. Two taps from opening to the payment screen (open, then Pay). Quantity can be changed inline.
4. Edge cases each have a next step: usual item unavailable (offer the nearest flavour in the same taste group), price changed (show clearly), drop full (ask first), drop closed (show next drop), hold timer visible.
   - **Nearest flavour:** same taste group and same size first, then the other size; non-specials before drop specials, then by name. Offered with one tap to accept, never swapped silently.
   - **Price or fee changed:** the old and new amounts are shown on the line. If the total has changed since the page was shown, the server answers `price_changed` with the new total and C7 asks "The total is now GH₵X. Continue?".
   - **Drop full:** quantities that no longer fit get a suggested lower quantity; the customer chooses "Reduce" or "See next drop". Nothing changes on its own.
   - **Delivery area gone or fee changed:** shown like a price change; if the area is gone, the customer chooses pickup or updates details on C3.
5. Page is light and loads in about 3 seconds on a mid-range phone on a weak connection (assumed target).
6. Three people who have never seen it complete it on a phone with no instructions. Record the times for the write-up.

### 6.4 Menu and brand (sample)
- Mirrors the public menu as observed (to be confirmed): taste groups Sweet (raw cane, passionfruit cane), Spicy (ginger-lemon cane), Sour (lemon-mint cane, lemon-charcoal cane), and "Drop special" tag for tigernut-coconut cane, cucumber cane and passionlemon cane.
- Main flow sizes: 330ml and 500ml. Group sizes (2L, 4L) as a P2 "Group order" option.
- Prices are samples (disclosed by the Demo data button, constraint 8). Currency format GH₵ with integer pesewas in the database.
- Visual direction: green and cream, friendly and bold, text wordmark only. British English copy. No em dashes.
- Visual style (approved 18 Oct 2026, revised the same day after a plant-shop reference that is not committed): a dark forest-green theme with cream text, cards as slightly lighter green panels with a hairline border and soft shadow, pill buttons and steppers, and a serif for headings (Fraunces, self-hosted, Latin subset, SIL Open Font Licence) with a system sans for body text. Flavours are shown as one licensed bottle photo, cut out and recoloured per flavour accent offline (`scripts/assets/make_bottles.py`, source in `public/bottles/SOURCE.md`), always on a cream studio disc so every flavour stays visible on dark green; small WebP files with fixed sizes, lazy below the fold. The page background is a photo of green cane stalks (`public/backgrounds/cane.webp`, supplied by Ryan for the demo on 22 Oct 2026; source and licence not recorded, so replace it before any real use) under a dark green wash, dark enough that body and muted text keep WCAG AA even over its brightest pixels. One small WebP; nothing else is an image except the flavour bottles. No new UI elements: the refresh restyles what exists and adds no search, tab bar, cart icon, wishlist, ratings, promos or other features the app does not have. Text contrast stays at WCAG AA and accents at least 3:1. Applies to customer and owner screens.
- No reviews are shown: invented reviews without a label would read as real ones (removed 18 Oct 2026). Never copy real customer reviews.

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
| **orders** | id, customer_id (nullable after purge), drop_id, status, fulfilment, address, area, fee_pesewas, total_pesewas, hold_expires_at, created_at, paid_at, refund_due, idempotency_key (unique, nullable: client-generated per submission, BR-O9) |
| **order_items** | order_id, menu_item_id, quantity, unit_price_pesewas |
| **payments** | id, order_id, reference (unique), outcome, result (confirmed, not_confirmed, hold_kept), reason (nullable), refund_due (a success that could not be confirmed), created_at |
| **reminders** | id, customer_id, drop_id, channel, status (queued, sent), sent_at |
| **turned_away** | id, drop_id, order_id (nullable, unique: one row per order, BR-F2), customer_id (nullable: the session's customer for a `drop_full` row), idempotency_key (nullable, unique), units, reason (`not_enough_space`, `drop_closed`, `drop_full`), created_at |
| **order_history** | id, order_id, from_status, to_status, actor, created_at |
| **forecast_snapshots** | id, drop_id, checkpoint_at, method (baseline, pace), projected_units |
| **owner_sessions** | id, token_hash (unique, SHA-256 only), expires_at, revoked_at, created_at (demo owner gate) |
| **owner_login_attempts** | id, ip_hash (SHA-256 of the IP, nothing else), created_at; rows older than 24 hours are pruned |

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
| PWA | Installable (home screen icon) from C6; minimal offline shell in a later slice |
| Deploy | Vercel (functions in `dub1`, Dublin, next to the Supabase project in eu-west-1) with Supabase PostgreSQL. Runtime uses the transaction pooler (port 6543, `prepare: false`, pool of 1, SSL); migrations and seeding use the session pooler. On Vercel the runtime reads `NUXT_`-prefixed variables (Nuxt only applies those at runtime) |
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

Environment variables (`.env.example` committed, real `.env` never; the full table with deployed values is in the README): `DATABASE_URL`, `MIGRATION_DATABASE_URL` (migrate and seed; falls back to `DATABASE_URL`), `DATABASE_POOL_MODE` (`transaction` forces pooled settings), `DEMO_MODE=true`, `DEMO_WHATSAPP_NUMBER`, `OWNER_PASSCODE`, `APP_URL`, `TRUST_PROXY` (default false: the owner login throttle uses the connection address; true on Vercel: it uses the `x-vercel-forwarded-for` header that the platform sets, and ignores any other forwarded header).

Key endpoints (indicative):

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | `{ ok: true, database: true or false }` from a trivial query with a short timeout. No data, no versions, no gate |
| `GET /api/drops/next` | Next open drop, spaces left |
| `POST /api/orders` | Create a `requested` order with no hold (BR-O9). Use the customer from the valid session (updating its first name and phone), otherwise create a new customer and a session. Never look up a customer by phone at order time (it would expose their history, BR-L7). A repeated idempotency key returns the existing order id only; with another browser's session it returns 409. **Reorder variant (C7):** `{ reorder: true, dropId, lines, fulfilment, deliveryAreaId?, idempotencyKey, expectedTotalPesewas }` from a valid session only; first name, phone and address are copied on the server from the customer and their last paid order, so the full phone never reaches the browser. `expectedTotalPesewas` is a guard only: never stored, never used as a price; if it differs from the server-computed total the answer is 409 `price_changed` with the new total. Client price fields (`unitPricePesewas`, `totalPesewas`) are rejected. |
| `GET /api/orders/:id` | Order summary for C4, only for the session that owns the order; otherwise 404 |
| `POST /api/orders/turned-away` | BR-F2 for a completely full drop: `{ dropId, units (1 to 24), idempotencyKey }`, session optional. 201 writes one `drop_full` row; a repeated key returns 200 and writes nothing; 409 if the drop is closed, past cut-off or has room for those units; 400 if invalid. No order, hold, customer or cookie. Under `/api/orders`, so the same WAF rate limit applies |
| `POST /api/orders/:id/pay-start` | Create the hold (BR-O1, BR-C4): one transaction, drop row locked, server-time cut-off, spaces recomputed; an existing active hold is returned unchanged; 409 `not_enough_space` records `turned_away` once per order. Session must own the order. Also used for "Refresh availability" (BR-P5) |
| `POST /api/payments/simulate` | Simulated provider callback: `{ orderId, reference, outcome }`, session must own the order, idempotent by reference (BR-P3). A confirmed first payment returns the private link once |
| `POST /api/me/link` | Make a new private link for the session's customer, revoking the old one (BR-L10); returns it once |
| `GET /c/:token` | Private link: validates, creates a session cookie, redirects to the latest paid order (BR-L3) |
| `GET /r/:token` | Reminder link (BR-L5): same as `/c/` for a `reminder` token that has not expired (it expires at that drop's cut-off) |
| `GET /api/owner/reminders`, `POST /api/owner/reminders/:id/send` | O5: builds the queue lazily and lists Due now and Coming up (masked phones only); Send creates the reminder link, returns the message once and marks the row sent (409 if already sent, not due outside demo mode, or no longer eligible) |
| `GET /api/me` | Customer from the session cookie only (404 without one): first name, masked phone, reminder state, and the last paid order's lines, fulfilment, area and fee. No address and no full phone |
| `POST /api/orders/:id/cancel` | `{ confirm: true }`. Session must own the order (else 404). Before cut-off only (BR-X3): a request or a paid order becomes `cancelled`; a paid one gets `refund_due` (BR-O4); a lapsed request is already over and is refused. Same locked transaction as the owner cancel, history actor `customer`. A payment arriving for a cancelled order never confirms it |
| `GET /api/me/orders` | The session's customer's orders for C9: drop date, lines, status, total, whether it can be cancelled. No phone, no address |
| `POST /api/me/delete` | `{ confirm: true }`, session required: BR-DP2 purge, then clears the cookie |
| `GET /api/lost-link` | C8: the prefilled "lost my link" text (first name only, never a token) and a wa.me URL to `DEMO_WHATSAPP_NUMBER`, or null when it is empty |
| `GET /api/owner/customers?q=`, `POST /api/owner/customers/:id/link` | O7: customers by first name with masked phones only; Send new link (BR-L6) returns the new link once and a prefilled chat to `DEMO_WHATSAPP_NUMBER` |
| `POST /api/reminders/optin`, `/optout` | Consent events, session required (BR-R1, BR-R2, BR-R8). `optin`: `{ channel: whatsapp or sms, frequency, source: c6, c7 or c9 }`, refused after "Stop reminders" unless the source is `c9` (BR-R8). `optout`: `{ choice: none or stop, source }` |
| `GET /api/owner/drop/:id/demand` | Demand view numbers |
| `GET /api/owner/close/:id`, `POST /api/owner/close/:id` | O3 Close batch (BR-B1 to B4). GET: the drop, orders sold, whether it can be closed and how (`after_cut_off`, `demo_early`, or why not). POST `{ unitsMade, unplannedSold, wasted? }`: 200 with the stored numbers and any warning (`difference`); a repeat on a completed drop returns the stored numbers unchanged; 409 `not_past_cut_off`, `last_open_drop` or `negative_wasted`; 400 if invalid |
| `POST /api/owner/login`, `/logout`, `GET /api/owner/session` | Demo owner gate: passcode from `OWNER_PASSCODE` compared in constant time; `gc_owner` cookie (HttpOnly, SameSite=Lax) holding a random token stored only as a hash; 5 failed attempts per 15 minutes per IP gives 429. Every other `/api/owner/*` route answers 401 with no detail without it. A live service would use real owner accounts |
| `GET /api/owner/drops` | Drops for the O1 picker (default: next open drop) |
| `GET /api/owner/metrics` | The four required pilot metrics (section 10) |
| `POST /api/owner/settings/buffer` | Buffer setting: careful, balanced or never_sell_out (BR-FC8) |
| `GET /api/owner/orders`, `POST /api/owner/orders/:id/fulfil`, `/cancel` | O2: filter by drop and status; fulfil only from paid_confirmed (BR-O3); cancel with confirmation, setting refund_due on a paid order (BR-O4); history actor owner |

Security basics: HTTPS only, Zod validation with a length limit on every string, a 16 KB request body limit on `/api/*` (413), the open-request cap (BR-O10), rate limiting by a Vercel WAF rule rather than in memory (serverless instances share no memory), noindex (robots meta and `X-Robots-Tag` on every response), row level security enabled on every table with no policies (the app connects only from the server as the table owner; the Supabase Data API and anon key are not used), HTML escaping, never log phone numbers or tokens, owner routes behind a passcode session (demo only; a real pilot needs proper owner accounts), seed is a CLI script and not an endpoint.

## 9. Seed data (`pnpm seed`)

Idempotent: inside one transaction delete rows where `is_sample` is true (children before parents), then insert. Uses a fixed random seed so every run is identical (with the same `now`, floored to the hour). Dates are relative to now and ignore the `drop_days` setting on purpose.

- **Dates:** the live drop's cut-off is now plus 3 days and its drop is 3 days after that; the further open drop is 4 days later. The newest completed drop is 7 days before the live drop (the slot in between is skipped so every completed drop is really in the past), then completed drops step back alternately 3 and 4 days.
- **8 past completed drops**, planned units gently growing roughly from 38 to 56 with noise. One drop hit capacity: the newest completed drop has a sample capacity of 50 (the others 70), demand of about 56, and turned-away rows for the excess.
- **40 sample customers** (matching the pilot size in section 10) named "Sample Customer 01" to "Sample Customer 40", with obviously fake phone values 0000000001 to 0000000040. Each customer is created by their first order, never matched by phone. About 40% order on several drops. Each has a stored "usual" via their last order.
- **Order arrival times** follow the pace curve. Convert the cumulative table (5 days: 20%, 4: 35%, 3: 60%, 2: 80%, 1: 92%, 0: 100%) into the share arriving each day (20, 15, 25, 20, 12, 8) and pick each order's day by weighted random choice (`pickDay`). Day d means the 24-hour bucket from cut-off minus (d+1) days up to cut-off minus d days. Add small per-drop noise so no two drops are identical.
- **Statuses:** mostly fulfilled, about 5 to 8% cancelled (all with `refund_due`, BR-O4), and some requests expired unpaid (so the request-to-paid rate is realistic). Every status change has an `order_history` row; every paid order has a payment row.
- **Close batch numbers** per past drop: unplanned sold between about 8 and 16, small waste, and made = orders sold + unplanned + wasted.
- **Live upcoming drop** about 3 days before cut-off with about 30 paid units and about 10 requested units, plus one further open drop with a few paid orders and no requests.
- **A few opted-in reminders** across channels and frequencies and a few outbox rows. Nothing is ever sent. Also examples the BR-R7 query must leave out: a customer who chose None, an opted-in customer inactive for longer than the retention period, and a deleted customer. The seed check requires at least one queue row for the live drop (Due now or Coming up) and none of those examples in it.
- **Forecast snapshots** for completed drops, computed as of each drop's nominal checkpoint with the same function O1 uses (BR-FC10): pace when at least 4 earlier drops have closed by that checkpoint, otherwise baseline. This gives the demo's accuracy metric scored drops.
- **Not seeded yet:** `access_tokens`.
- **Verification step** inside the same transaction (any failure rolls everything back): row counts, 12 settings, the made-equals-sold identity, and that the learned pace table is within 8 percentage points of the one used to generate the data. Drops that hit capacity are left out of the learned pace table, because turning customers away cuts off the late orders and would skew the shape. It also checks the live drop as customers see it (paid units and active holds from the same query as `GET /api/drops/next`): paid 28 to 36 units, requested 9 to 16 units and at least one space left; otherwise the seed rolls back.
- **Smoke test leftovers:** before inserting, the seed deletes every order on a sample drop (sample or not) and every customer carrying the smoke marker (first name "Smoke test", phone `+233200000099`, defined once in `server/db/seed/smoke-marker.ts`), whatever its `is_sample` flag, so a smoke run against a deployment not in demo mode still cleans up.
- **Smoke test (`pnpm smoke`):** writes only marked sample data, checks its orders are flagged `is_sample`, cancels its own orders at the end through the owner cancel action (so capacity is freed before any reseed), explains a sold-out drop with capacity, paid units and active holds, and fails the run if any required step was skipped.
- **Demo Customer A (demo mode only):** when the seed runs with `DEMO_MODE` on, it adds "Demo Customer A" (fake phone `0000000099`, sample) with a fulfilled "usual" order of 2 bottles on the second-newest completed drop (that drop's units made include them, so the close batch identity holds), opted in to WhatsApp reminders every drop, no order on the live drop, and a private link with a fixed token (`server/domain/identity/demo-customer.ts`, stored as a hash) published in the README and on C0. With `DEMO_MODE` off none of this is created. The seed check requires the link to resolve to a customer with a paid order in demo mode.

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
