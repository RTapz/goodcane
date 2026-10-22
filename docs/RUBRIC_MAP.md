# Rubric map

Where each rubric line is shown in the prototype: screens, rules (from [PROJECT_SPEC.md](PROJECT_SPEC.md)), tests and code. Facts only. Screen codes (C1, O1 and so on) are the spec's (section 6). Test files are under `tests/`; `api` tests call the built app over HTTP, `integration` tests use a real `_test` database, `unit` tests are pure.

## 1. Clarity of the demand problem

| What | Where |
|---|---|
| Problem statement, evidence and chosen approach | Spec section 2 (customer problem, business problem, one-line version, indicative evidence, why not the alternatives) |
| Assumptions stated, not verified | Spec Appendix A (A1 to A26), shown in plain words on C0 `/about` (`app/pages/about.vue`) |
| Demand counted as paid plus turned away, so a sold-out drop does not understate demand | BR-FC1, BR-F2; `server/domain/forecast/demand.ts`, `server/domain/forecast/turned-away.ts`, `server/services/owner/facts.ts` |
| Demand recorded even when a drop is completely full | BR-F2 (drop_full); C2 full state in `app/pages/order.vue`; `POST /api/orders/turned-away` (`server/services/orders/turned-away.ts`) |
| Tests | `unit/forecast/forecast.test.ts`, `unit/forecast/snapshot.test.ts`, `integration/turned-away.test.ts`, `integration/demand.test.ts`, `integration/pay.test.ts` |

## 2. Ease of ordering and reordering on mobile

| What | Where |
|---|---|
| First order in four screens: C1 landing, C2 build order, C3 details, C4 review, then C5 simulated payment and C6 confirmation | `app/pages/index.vue`, `order.vue`, `details.vue`, `review/[id].vue`, `pay/[id].vue`, `confirmed/[id].vue` |
| Reorder in two taps: open the private or reminder link, press Pay (C7 "Same again?") | Spec 6.3; `app/pages/same-again.vue`; `server/routes/c/[token].get.ts`, `server/routes/r/[token].get.ts`; reorder variant of `POST /api/orders` |
| One-tap returning customer for reviewers: Demo Customer A's published link (demo mode only, BR-L4 exception) | Spec section 9; `server/domain/identity/demo-customer.ts`; "Try as a returning customer" on `/about` |
| Never a dead end: closed drop offers the next one, full drop asks first (BR-F1), lost link offers "Message GoodCane" (C8) | `app/pages/order.vue`, `app/pages/link-invalid.vue`, `app/components/LostLinkHelp.vue` |
| Mobile-first layout: single column, bottom-anchored actions, 44px targets | Spec 6; checked by hand at 360px during each slice |
| Tests | `api/app.test.ts` (private link to rendered C7, Demo Customer A, reorder in two steps, price guard), `integration/place-order.test.ts`, `integration/links.test.ts`, `integration/me.test.ts`, `unit/orders/usual.test.ts`, `unit/app/payment-flow.test.ts`, `unit/app/format-and-cart.test.ts` |
| Not yet measured | The 3-person C7 usability test (spec 6.3, criterion 6) has a template in [USABILITY_TEST.md](USABILITY_TEST.md); no results are recorded in the repository |

## 3. Usefulness of the business demand view

| What | Where |
|---|---|
| O1 This drop: Paid and Likely tiers, projection and range, buffer, suggested production, spaces left, turned away, planned share, by flavour, pilot metrics | BR-FC1 to FC12; `app/pages/owner/index.vue`; `server/services/owner/demand.ts`; `server/domain/forecast/*` |
| O2 Orders: filter, mark fulfilled, cancel with refund due | BR-O3, BR-O4; `app/pages/owner/orders.vue`; `server/services/owner/orders.ts` |
| O3 Close batch: made, unplanned, wasted, identity warning, exact planned share afterwards | BR-B1 to B4; `app/pages/owner/close.vue`; `server/domain/batch/close.ts`; `server/services/owner/close-batch.ts` |
| O5 Reminder queue: who is due for the next drop, one chase per drop, Send with a fresh reminder link | BR-R3 to R7, BR-L5; `app/pages/owner/reminders.vue`; `server/services/reminders-queue.ts` |
| O7 Customers: masked phones, Send new link | BR-L6; `app/pages/owner/customers.vue`; `server/services/owner/customers.ts` |
| Forecast is plain arithmetic, no AI, with an honesty note that it learns from seeded data | Spec section 2 (AI) and 5.9 honesty rule; note on O1 and C0 |
| Tests | `unit/forecast/*.test.ts`, `unit/batch/close.test.ts`, `unit/reminders/due.test.ts`, `integration/demand.test.ts`, `integration/close-batch.test.ts`, `integration/reminder-queue.test.ts`, `integration/owner-orders.test.ts`, `integration/owner-customers.test.ts`, `api/app.test.ts` (owner gate and each owner route) |

## 4. Working end-to-end demonstration

| What | Where |
|---|---|
| Deployed app with health check | `https://goodcane.vercel.app`; `GET /api/health` (`server/api/health.get.ts`) |
| Repeatable sample data: one transaction, verified, rolls back on any failed check | `pnpm seed` (`server/db/seed/run.ts`, `verify.ts`): close-batch identity, learned pace table, live drop, reminder queue, Demo Customer A |
| End-to-end smoke test over HTTP against a deployment: order, pay, private link, reorder, owner login, demand, cleanup | `pnpm smoke` (`scripts/smoke.ts`, `scripts/smoke-report.ts`); passed against a local server on the test database |
| Tests | 4 suites: unit, integration, API (built server), smoke; `unit/seed/*.test.ts`, `integration/seed-cleanup.test.ts`, `unit/smoke-report.test.ts` |
| Not in the repository | The demo video, the written explanation and the full measurement plan (deliverables 2 to 4, spec section 1) |

## 5. Realistic pilot and measurement plan

| What | Where |
|---|---|
| Metric formulas, pilot size and length, draft continue and stop thresholds, threats to validity | Spec section 10 (summary only; the full plan is deliverable 4, not in the repository) |
| The four required metrics as numbers: repeat-order rate, confirmed weekly orders, cancellation rate (with expiry rate), forecast accuracy (MAPE, WAPE, bias, naive benchmark, scored drops) | "Pilot metrics" on O1: `app/components/owner/PilotMetrics.vue`, `server/services/owner/metrics.ts` |
| Planned share, exact once a batch is closed | BR-FC12; O1 and O3 |
| Forecast scored fairly: snapshots as of the checkpoint, like-for-like demand units | BR-FC10, BR-FC11; `server/domain/forecast/snapshot.ts`, `server/services/owner/snapshots.ts` |
| Tests | `unit/forecast/forecast.test.ts` (spec fixtures: 48.6 baseline, MAPE about 8.9%), `unit/forecast/snapshot.test.ts`, `integration/demand.test.ts` |

## 6. Privacy and operational practicality

| What | Where |
|---|---|
| Only necessary data; no email, date of birth, location or trackers | Spec 5.8; C0 data section |
| No passwords; random tokens, only SHA-256 hashes stored; private link shown once (one documented demo exception) | BR-L1 to L4; `server/services/tokens.ts`, `server/services/links.ts` |
| History never shown because someone typed a phone number; masked phones on every customer and owner screen | BR-L7, BR-L8; `server/domain/identity/phone.ts` |
| Opt-in reminders, nothing preselected, append-only consent, Stop at any time, resubscribe only by the customer on C9 | BR-R1, BR-R2, BR-R8; `server/domain/reminders/consent.ts`, `server/services/reminders.ts` |
| The app never sends messages; every wa.me link goes to the demo number only | Constraint 3; `server/domain/identity/share.ts` |
| Delete my data now, and the 6-month retention purge, both keeping orders anonymised | BR-DP1 to DP3; `server/domain/retention/*`, `server/services/retention.ts`, `pnpm retention` (`server/db/retention.ts`) |
| Owner screens behind a passcode session with a login throttle; every owner route 401 without it | Spec section 8; `server/middleware/owner.ts`, `server/services/owner/sessions.ts` |
| Request size limit, noindex, row level security on every table, remote-database guard on scripts | Spec section 8; `server/middleware/body-limit.ts`, migration 0004, `server/db/remote-guard.ts` |
| Operations: lazy reminder queue (no cron), close batch idempotent and locked, capacity checked in one locked transaction | BR-R3, BR-B4, BR-C4 |
| Tests | `integration/purge.test.ts`, `integration/retention.test.ts`, `integration/reminders.test.ts`, `integration/rls.test.ts`, `integration/owner-gate.test.ts`, `unit/identity/*.test.ts`, `unit/reminders/consent.test.ts`, `unit/db/remote-guard.test.ts`, `api/app.test.ts` (no full phone in responses, owner 401s, cookie flags) |

## Built versus designed

**Built:** C0 to C9 and O1, O2, O3, O5, O7 (O7 without delete); simulated payment with holds; private and reminder links; reminder consent and queue; Delete my data now; `pnpm seed`, `pnpm smoke` and `pnpm retention`; Demo Customer A.

**Designed, not built:**
- O4 Settings (sample values are fixed in `server/db/settings-defaults.ts`; only the buffer setting can be changed, on O1).
- O6 Metrics page (the four required metrics are on O1; payment completion rate, reminder to reorder, median days between orders and waste rate are not shown).
- Reminder opt-out rate next to the cancellation rate (spec section 10).
- Waitlist (BR-F3) and the short undo after cancelling (BR-X4).
- "By owner" confirmation mode (BR-O7): the setting exists, the path does not.
- The 24-hour confirm nudge (BR-R6).
- Automatic generation of future drops (BR-D5): drops come from the seed.
- Group order sizes, 2L and 4L (spec 6.4): only 330ml and 500ml are orderable.
- PWA offline shell (spec section 8).
- Recording turned-away demand on C7 when a reorder does not fit (only C2 records it).

## Limitations

- **Sample data only.** No real customers, prices, payments or messages; the forecast learns from seeded data, so it shows the method, not real accuracy.
- **Payments are simulated.** No provider; refunds are a flag (`refund_due`), no money moves.
- **Reminders are sent by hand.** The owner opens a prefilled chat; nothing is delivered by the app.
- **Owner access is one demo passcode,** not individual accounts.
- **Rate limiting is a Vercel firewall rule** set in the dashboard, not code. Anonymous "I wanted N" rows on a full drop can be added up to that limit, accepted only because all data is sample data.
- **The private link sits in the URL path,** so hosting logs may record it (README, Privacy).
- **Session after a lost response:** a replayed order can leave the browser without a session cookie (README, Known limitations).
- **Demo Customer A's link is public by design;** Delete my data or Send new link on that customer kills it until the next reseed.
- **The page background photo** is used without a recorded source or licence (`public/backgrounds/SOURCE.md`); replace it before any real use. The bottle photo is credited under the Unsplash Licence (`public/bottles/SOURCE.md`).
- **Closing a drop early** is a demo-only shortcut and removes that drop from customers until the next reseed.
- **Not in the repository:** results of the C7 usability test with 3 people, the demo video, the written explanation and the full measurement plan.
