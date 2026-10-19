# Walkthrough

Plain-language explanations of the trickier parts of GoodCane Drops: the pace functions (sections 1 and 2), the idempotency key on order creation (section 3), transactions, row locks and holds on payment (section 4), "your usual" on C7 (section 5), and the forecast behind the owner's demand view, O1 (section 6).

Two small functions do the "pace" work in GoodCane Drops. `pickDay` invents realistic arrival times for sample orders. `learnPaceTable` reads arrival times back and learns the shape. If the seed is working, the shape it learns should be close to the shape `pickDay` was told to produce. That check runs at the end of every `pnpm seed`.

This guide assumes you know Python and are new to TypeScript and to automated tests.

## Shared idea: days before cut-off

Every drop has a cut-off: the moment orders close. We count backwards from it in whole days.

- **Day 0** is the last 24 hours before cut-off.
- **Day 1** is the 24 hours before that, and so on up to **day 5**.
- Precisely, day d is the time from "cut-off minus (d+1) days" up to, but not including, "cut-off minus d days".

So if cut-off is Tuesday at noon, day 0 runs from Monday noon to Tuesday noon, and day 5 runs from the previous Wednesday noon to Thursday noon.

## 1. pickDay: choosing an order's arrival day

File: `server/db/seed/pickDay.ts`

### What it does

The spec says paid orders arrive in this pattern:

| Day before cut-off | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|
| Share of orders | 20% | 15% | 25% | 20% | 12% | 8% |

`pickDay` is a weighted random choice: it returns 5 about 20% of the time, 4 about 15% of the time, and so on.

### How it works, in plain language

Picture a ruler 100 units long, cut into six pieces whose lengths are the weights:

```
day 5     day 4    day 3          day 2       day 1    day 0
[0 .. 20) [20..35) [35 ......60)  [60 ...80)  [80..92) [92..100)
```

1. Ask for a random number between 0 and 1 (never exactly 1).
2. Multiply by 100 to get a point on the ruler.
3. Walk along the pieces, keeping a running total of their lengths. The first piece whose end is past the point is the answer.

### Worked example

Say `rand()` returns 0.59. The point is 59.

| Day | Weight | Running total | Is 59 below it? |
|---|---|---|---|
| 5 | 20 | 20 | no |
| 4 | 15 | 35 | no |
| 3 | 25 | 60 | **yes**, answer is 3 |

The edges follow the same rule. 0.6 gives point 60, which is not below 60 but is below 80, so the answer is 2. The test file checks these exact edges: 0 and 0.19 give 5, 0.2 gives 4, 0.59 gives 3, 0.6 gives 2, 0.999 gives 0.

If `rand()` returns 1 (point 100), something negative, or not a number at all, no piece matches and the function throws a `RangeError` saying which point it got.

### Your Python, reviewed

Your `pick_day` was correct: every boundary above comes out right, it calls `rand()` only once, and it fails loudly if nothing matches. The TypeScript version makes two small changes:

1. **Negative input is rejected.** In Python, `rand()` returning -0.1 gives point -10, which is below 20, so it would quietly return 5. The TypeScript version only walks the ruler when the point is 0 or more.
2. **Days and weights are kept together.** `zip(DAYS, WEIGHTS)` silently stops at the shorter list if someone edits one list and not the other. The TypeScript version keeps them as one list of pairs, `{ day: 5, weight: 20 }`, so they cannot get out of step.

### Python to TypeScript, line by line

| Python | TypeScript | Notes |
|---|---|---|
| `DAYS = [5, 4, 3, 2, 1, 0]` and `WEIGHTS = [...]` | `const DAY_WEIGHTS = [{ day: 5, weight: 20 }, ...] as const` | One list of pairs. `const` means the name cannot be reassigned. `as const` also stops anyone changing the values. |
| `total = sum(WEIGHTS)` | `DAY_WEIGHTS.reduce((sum, { weight }) => sum + weight, 0)` | `reduce` folds a list into one value, starting from `0`. Like `functools.reduce`. |
| `def pick_day(rand):` | `export function pickDay(rand: () => number): number {` | `export` makes it importable. `rand: () => number` means "a function that takes nothing and returns a number". The final `: number` is the return type. |
| `point = rand() * total` | `const point = rand() * TOTAL_WEIGHT` | Same. |
| `running = 0` | `let running = 0` | `let` is for a variable that changes. `const` is for one that does not. |
| `for day, weight in zip(DAYS, WEIGHTS):` | `for (const { day, weight } of DAY_WEIGHTS) {` | `of` loops over items (like Python's `in`). `{ day, weight }` unpacks the pair, like tuple unpacking. |
| `if point < running: return day` | `if (point < running) { return day }` | Brackets round the condition, braces round the body. |
| `raise ValueError(f"{point} is not below {total}")` | ``throw new RangeError(`pickDay: point ${point} is not in [0, ${TOTAL_WEIGHT})`)`` | Backtick strings with `${...}` are TypeScript's f-strings. `RangeError` is the built-in error for "number out of range". |

## 2. learnPaceTable: learning the shape back

File: `server/domain/forecast/pace.ts`

### What it does

Given some closed drops, each with its cut-off and the units paid at each moment, it answers: "on average, what share of a drop's final units had already been paid by each day before cut-off?" That is the pace table the forecast uses (spec BR-FC3).

### How it works, in plain language

For each drop:

1. Add up all its paid units. That is the drop's total.
2. For each day d from 5 down to 0, add up the units paid strictly earlier than "cut-off minus d days", and divide by the total.

Then average each day's share across the drops. Each drop counts once, whatever its size, so one huge drop cannot drown out the rest.

### Worked example

One drop, 10 units in total, paid in buckets 5 to 0 as 2, 1, 3, 2, 1, 1 units:

| Day d | Units paid before "cut-off minus d days" | Share |
|---|---|---|
| 5 | 2 | 2 / 10 = 0.2 |
| 4 | 2 + 1 = 3 | 0.3 |
| 3 | 3 + 3 = 6 | 0.6 |
| 2 | 6 + 2 = 8 | 0.8 |
| 1 | 8 + 1 = 9 | 0.9 |
| 0 | 9 + 1 = 10 | 1.0 |

With a second drop, you work out its six shares the same way, then average day by day. For example, if drop A has 0.5 at day 5 and drop B has 1.0, the table says 0.75 at day 5.

"Strictly earlier" matters at the edges. A payment exactly 5 days before cut-off is not earlier than "cut-off minus 5 days", so it counts from day 4 onwards. That matches the bucket rule, where day 4 starts exactly 5 days before cut-off.

### Edge cases, and why

- **No drops at all: throws a `RangeError`.** There is nothing to average. Returning zeros would look like real data saying "nobody ever pays early", which is wrong.
- **A drop with zero paid units: skipped.** Its share would be 0 divided by 0, which has no answer. Skipping it lets the other drops still teach the shape.
- **Every drop has zero units: throws a `RangeError`**, for the same reason as no drops.
- **Day 0 is not forced to 1.** A payment at or after cut-off should never happen (BR-D3). If one does, day 0 shows less than 1, so the problem is visible instead of hidden.
- **Drops that sold out are left out by the caller** (`server/db/seed/verify.ts`), not by this function. When a drop fills up, the late customers are turned away, so too few late payments are recorded and the shape looks earlier than real demand.

## How the tests work

Tests are small programs that call a function with known inputs and check the output. We use **Vitest**: you run `pnpm test`, and it finds every `*.test.ts` file and reports what passed.

A test reads like this:

```ts
it('maps rand 0.59 to day 3', () => {
  expect(pickDay(() => 0.59)).toBe(3)
})
```

- `it('...', () => { ... })` names one check and holds its code. In pytest this is one `def test_...():`.
- `expect(value).toBe(3)` is like `assert value == 3`.
- `() => 0.59` is a tiny function that always returns 0.59. It is a fake `rand`, so the test is not random. (Python: `lambda: 0.59`.)
- `toBeCloseTo(0.35)` is used for decimals, because decimals are not exact in floating point (0.1 + 0.2 gives 0.30000000000000004, in Python too). It is like `pytest.approx`.
- `expect(() => pickDay(() => 1)).toThrow(RangeError)` checks that an error is raised, like `with pytest.raises(...)`.
- `it.each([...])` runs the same check over a table of inputs, like `@pytest.mark.parametrize`.

The tests live in `tests/unit/seed/pickDay.test.ts` and `tests/unit/forecast/pace.test.ts`.

## How the seed checks the two against each other

`pnpm seed` uses `pickDay` to place every sample payment, then runs `learnPaceTable` over the completed drops (minus the one that sold out) and prints the result next to the target. The latest run:

| Day | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|
| Learned | 24.6% | 42.2% | 54.8% | 78.4% | 87.4% | 100% |
| Target | 20% | 35% | 60% | 80% | 92% | 100% |

Every day is within the 8-point limit, so the seed commits. The gaps are normal randomness: 7 drops of about 20 orders each is a small sample. Day 4 is the closest to the limit at 7.2 points off. The honesty rule in the spec applies: this proves the mechanism works, not that the forecast is accurate with real customers.

## 3. The idempotency key: one tap, one order

File: `server/services/orders/place-order.ts` (rule BR-O9)

### The problem

Phones on a weak connection do strange things. A customer taps Continue, nothing seems to happen, so they tap again. Or the browser quietly retries a request that timed out. Each tap sends the same order to the server. Without protection, two taps would mean two orders, two rows in the demand view and a confused customer.

### The idea

"Idempotent" means "doing it twice has the same effect as doing it once". Pressing a lift button a second time does not call a second lift.

We get that with an **idempotency key**: a long random id (a UUID, such as `3f2a…c91`) that the C3 page makes up **before** it sends the order. Every repeat of the same submission carries the same key. The server stores the key on the order, and the database refuses to store the same key twice (a `unique` constraint on `orders.idempotency_key`).

When an order arrives, the server first asks "do I already have an order with this key?"

- **No:** create the order and remember the key.
- **Yes, and it is from the same browser:** do nothing new, and answer with the order that already exists.
- **Yes, but another browser's session is asking:** answer "conflict" and reveal nothing about that order.

The page makes a new key whenever the order itself changes (different items, name, phone or address). Editing and resubmitting is a new order; tapping twice is not.

### What a transaction adds

Everything the server writes for one order happens inside one **database transaction**: the customer row, the order, its items, its history row and the session token. A transaction is all or nothing. If anything fails half way, the database undoes every write in it, as if none of them happened. (The C5 slice will add more detail on transactions, when holds need them to stop overselling.)

### Worked example: a double tap on a new phone

Ama, on a phone that has never ordered before, taps Continue twice within a fraction of a second. Both requests carry key `K` and neither carries a session cookie yet.

| Step | Request 1 | Request 2 |
|---|---|---|
| 1 | Starts a transaction. Is there an order with key `K`? No. | Starts a transaction. Is there an order with key `K`? No (request 1 has not finished yet). |
| 2 | Checks the drop, prices, spaces. All fine. | Same checks. All fine. |
| 3 | Creates customer C1 and order O1 with key `K`. | Creates customer C2, then tries to create an order with key `K`. The database makes it wait, because request 1 is about to use that key. |
| 4 | Commits. O1 and C1 now exist. Sets Ama's session cookie. | The wait ends with "duplicate key". The whole transaction is undone, so customer C2 disappears too. |
| 5 | Answers: order O1. | Looks up key `K` again, finds O1, and answers: order O1. |

Result: one order, one customer, and both taps lead Ama to the same review page. The test "a double tap racing in parallel still gives one order and one customer" in `tests/integration/place-order.test.ts` runs exactly this.

### One honest limitation

In step 5, request 2 does not set a cookie: the server only stores the token's hash, so it cannot hand out request 1's token again. If request 1's answer is lost (the connection drops after the server committed) and only request 2's answer arrives, Ama's browser ends up with no session cookie. She sees "We can't find this order on this device" on the review page and can place the order again; the old one simply lapses after 2 days. This is noted in the README.

## 4. Holding the last spaces: transactions and row locks

Files: `server/services/orders/pay-start.ts`, `server/services/orders/locked-order.ts` (rules BR-O1, BR-C4)

### The problem

When a customer taps Pay, GoodCane holds their bottles for 10 minutes while they pay. A drop has a fixed number of spaces. If two customers tap Pay at the same moment for the last few spaces, the app must never promise the same bottles to both. That mistake is called **overselling**.

### Idea 1: a transaction is all or nothing

A **transaction** groups several database steps so they succeed together or not at all. Think of it as writing in pencil: until the transaction **commits**, nothing is final, and if anything goes wrong it is **rolled back**, as if none of the steps happened. Section 3 used this for creating an order.

A transaction alone is not enough here, though. Two transactions can run at the same time, and both can read "3 spaces left" before either writes anything. Both would then hold 3 bottles, and 6 bottles are promised from 3 spaces.

### Idea 2: a row lock makes them take turns

The fix is a **row lock**. Before counting spaces, pay-start reads the drop's row with `SELECT ... FOR UPDATE`. That says: "I am about to change things that depend on this drop; anyone else who wants to do the same must wait until I commit."

It works like a single key to a stock room. Whoever holds the key counts the shelves and writes their name on the bottles they take. The next person waits at the door, gets the key afterwards, and counts the shelves again, so they see what the first person took.

Only work on **the same drop** waits. Customers paying for different drops never block each other, and the wait lasts milliseconds.

### Worked example: two customers, 3 spaces left

The drop has room for 5 bottles. 2 are already paid, so 3 spaces are left. Ama and Kofi each want 3, and both tap Pay at the same moment.

| Step | Ama's pay-start | Kofi's pay-start |
|---|---|---|
| 1 | Starts a transaction. Locks the drop row. | Starts a transaction. Tries to lock the drop row, and **waits**: Ama has the key. |
| 2 | Counts: 5 capacity minus 2 paid minus 0 held = 3 spaces. Her 3 bottles fit. | (still waiting) |
| 3 | Writes her hold: `hold_expires_at` = now + 10 minutes. | (still waiting) |
| 4 | Commits. The lock is released. | Gets the lock. |
| 5 | Sees "spaces held for 10:00" on C5. | Counts again: 5 minus 2 paid minus **3 held by Ama** = 0 spaces. His 3 bottles do not fit. |
| 6 | | Writes one `turned_away` row (3 bottles, "not_enough_space"), commits, and sees "Not enough space left" with Rebuild my order. Nobody is moved to another drop. |

Without the lock, step 5 for Kofi could have happened before step 3 for Ama, and both would have been held. The integration test "two simultaneous pay-starts for the last spaces: exactly one succeeds" in `tests/integration/pay.test.ts` runs this race for real against the test database.

### When the hold runs out

A hold is just a time in `hold_expires_at`. When it passes, the hold stops counting: the space calculation only includes holds whose time is still in the future. No clean-up job is needed. If Ama's 10 minutes pass without paying, Kofi's next try (or "Refresh availability") finds the 3 spaces free again.

### Idempotency again, for payments

The simulated payment uses the same idea as section 3, keyed on the **payment reference**. Each tap on a Simulate button makes a new reference. If the same reference arrives twice (a slow network retrying, or a provider calling back twice), the second time returns the stored result and changes nothing, so an order can never be confirmed twice. A success that arrives after the hold expired is re-checked under the same lock: if the bottles still fit it is confirmed; if not, the payment is stored as "not confirmed" with `refund_due` set, and the customer is told no order was made.

## 5. buildUsualOrder: "your usual", checked against today

File: `server/domain/orders/usual.ts` (spec 6.3)

### What it does

On C7 the customer sees their last paid order, ready to pay again. But the world may have moved on since then: a flavour can be sold out, a price can change, the drop can be nearly full. `buildUsualOrder` takes three things:

- the lines of the last paid order (item, quantity, and the price paid),
- today's menu (with which items are available in this drop),
- the spaces left in the drop,

and returns each line with a **status**, plus whether the whole order fits. It never changes anything by itself: it only describes what it found, so the page can ask the customer.

| Status | Meaning | What C7 shows |
|---|---|---|
| `ok` | Same item, same price, fits | Nothing extra |
| `price_changed` | The price is different from last time | "was GH₵30.00, now GH₵35.00" |
| `substituted` | The item is not available, but a similar one is | "Try Passionfruit cane 330ml?" with **Use this** and **Leave it out** |
| `unavailable` | Nothing similar in the same taste group | "No similar drink in this drop, so it is left out" |
| `too_big_for_space` | The drop cannot take this many | A suggested lower quantity, offered with **Reduce to fit** or **See next drop** |

"Similar" means: the same taste group (sweet, spicy, sour), the same size first, then the other size; ordinary flavours before drop specials, then alphabetical.

### Worked example

Last time Ama bought:

- 2 x Raw cane 330ml at GH₵30.00
- 3 x Lemon-mint cane 500ml at GH₵45.00

Today: Raw cane 330ml costs GH₵35.00. Lemon-mint 500ml is sold out, and Lemon-charcoal 500ml (also sour) is available at GH₵45.00. The drop has **4 spaces** left.

1. **Raw cane 330ml.** Still on the menu, so the item is the same. 2 bottles need 2 spaces; 4 are left, so it fits, leaving 2. The price went from 3000 to 3500 pesewas, so the status is `price_changed` and C7 shows "was GH₵30.00, now GH₵35.00".
2. **Lemon-mint 500ml.** Sold out. Looking for a substitute: same taste group (sour), same size (500ml) gives Lemon-charcoal 500ml. Status `substituted`. It does not count yet: Ama has to tap **Use this** or **Leave it out**.
3. Ama taps **Use this**. The function runs again with that choice. Now the line is 3 x Lemon-charcoal 500ml, which needs 3 spaces, but only 2 are left after line 1. The status stays `substituted` (that matters most to show), but the line now carries a suggested quantity of 2 (`cappedQuantity`), and the order no longer fits.
4. The whole order does not fit, so Pay stays disabled and C7 asks: **Reduce to fit** (Lemon-charcoal becomes 2) or **See next drop**. Ama taps Reduce. Now everything fits: 2 x Raw cane at GH₵35.00 plus 2 x Lemon-charcoal at GH₵45.00 = **GH₵160.00**.
5. Ama taps **Pay**. The page sends the lines and the total it showed (16000 pesewas) as a check. The server works out the price itself from the menu; if its total were different, it would refuse and C7 would ask "The total is now GH₵X. Continue?". The customer never pays a number they did not see.

At no step did the app swap, reduce or move anything without Ama tapping a button.

## 6. The forecast: from bookings to "make about N"

Files: `server/domain/forecast/*` (spec 5.9). The database work is in `server/services/owner/demand.ts`; every number is worked out by the small pure functions below, so each one can be checked by hand.

Everything is counted in **units**: 1 unit = one 330ml bottle; larger sizes count as more, using each menu item's `capacity_weight` (sample: 330ml = 1, 500ml = 1, 2L = 6, 4L = 12).

Anything that cannot be worked out comes back as `{ ok: false, reason: 'no_history' }` (or another named reason) instead of a number, so the screen never shows `NaN`.

### demandUnits: what people really wanted (BR-FC1)

`demand = paid units + turned-away units`. A drop that sold out at 50 with 6 more units turned away had a demand of **56**, not 50. Using paid units alone would teach the forecast that sell-outs mean low demand.

### turnedAwayUnits: not counting anyone twice (BR-F2)

Ama is turned away for 3 units, reduces her order and pays for 1. Her 1 paid unit is already counted, so her turned-away row is ignored. Kofi is turned away for 2 and does not come back: his 2 count. Rows with no order attached (the seed's) always count. So 3 + 2 + 4 (no order) gives **6**, not 9.

### weightedBaseline: recent drops count more (BR-FC2)

The last 4 finished drops' demand, oldest first: 40, 44, 50, 52. Weights 1, 2, 3, 4, newest highest:

(40 x 1 + 44 x 2 + 50 x 3 + 52 x 4) / (1 + 2 + 3 + 4) = (40 + 88 + 150 + 208) / 10 = **48.6**

With fewer than 4 drops it uses weights 1 to n; with none it returns `no_history`.

### paceShareAt: how much is usually paid by now (BR-FC3, BR-FC4)

`learnPaceTable` (section 2) gives the share of final paid units already paid by each day before cut-off. The seed's shape is 20%, 35%, 60%, 80%, 92%, 100% for days 5 to 0. Drops that hit capacity are left out (`hitCapacity`): their late customers were turned away, which would make orders look earlier than they are.

Between whole days the share is a straight line. At **2.3 days** before cut-off we are between day 3 (60%) and day 2 (80%), 0.3 of the way back from day 2:

80% - 0.3 x (80% - 60%) = **74%**

More than 5 days before cut-off there is no data, so the answer is `too_early`. At or after cut-off the share is 1: everything that will be paid has been.

### paceProjection: where today's bookings are heading (BR-FC4)

`projection = paid units now / share`. 30 paid when 60% is usually in gives 30 / 0.6 = **50**; 30 paid when only 40% is usually in gives 30 / 0.4 = **75**. A share of 0 is refused (`share_zero`) instead of dividing by zero.

### chooseHeadline: pace or baseline (BR-FC5)

- Fewer than 4 finished drops: the **baseline**, because the pace table needs history.
- More than 5 days before cut-off: the baseline, labelled **"Baseline (too early for pace)"**.
- Otherwise the **pace projection**, with the baseline shown beside it for comparison.

### conversionRate and likelyUnits: the Likely tier (BR-FC6)

Requests are not paid yet, so they are not counted as demand. Of all orders placed on finished drops, the share that got paid is the conversion rate (sample fallback 0.7 with fewer than 3 finished drops). 10 requested units x 0.7 = **7 likely**. Lapsed requests (5.3 note) are left out first. Likely is always shown apart from Paid.

### projectionRange: an honest "about" (BR-FC7)

`projection plus or minus the recent error band`. The band is the WAPE of the last few scored drops (below). With none yet it falls back to 10%: 50 becomes **about 45 to 55**. With a recent WAPE of 8.9%: 50 x 0.089 = 4.45, so **about 46 to 54**.

### unplannedBuffer: walk-ins and WhatsApp orders (BR-FC8)

From the last 5 finished drops' "sold without a pre-order" figures, say 8, 12, 10, 16, 9:

- **Careful with waste** = the lowest, **8**
- **Balanced** = the average, (8 + 12 + 10 + 16 + 9) / 5 = **11**
- **Never sell out** = the highest, **16**

With fewer than 3 finished drops it uses a sample 10 and says **Low confidence**.

### suggestedProduction: the headline (BR-FC9)

`round(projection + buffer)`, rounded once at the very end: round(48.6 + 11) = round(59.6) = **60**. It is a suggestion; the owner decides.

### plannedShare: how predictable the drop was (BR-FC12)

`pre-ordered / (pre-ordered + sold without a pre-order)`. 45 pre-ordered and 15 walk-ins gives 45 / 60 = **75%**. Before the batch is closed there is no walk-in figure yet, so the open drop shows an estimate against the suggestion: "45 of 60 expected units pre-ordered (estimate)".

### snapshotAtCheckpoint: recording the forecast fairly (BR-FC10)

To score a forecast later we must keep what it said at a fixed moment, the checkpoint: 3 days before cut-off. The function is given everything and throws away what came later itself: payments after the checkpoint, cancellations after it, and drops that closed after it. So if nobody opens O1 until a day late, the snapshot it writes is **exactly the same** as an on-time one (there is a test for this). It is written once per drop and method, and the seed writes past drops' snapshots with the same function.

### mape, wape, bias, naiveBenchmark: was it any good? (BR-FC11)

Spec fixture, as (forecast, actual):

| Drop | Forecast | Actual | Error | Error / actual |
|---|---|---|---|---|
| 1 | 50 | 46 | +4 | 8.70% |
| 2 | 44 | 50 | -6 | -12.00% |
| 3 | 58 | 52 | +6 | 11.54% |
| 4 | 47 | 48 | -1 | -2.08% |
| 5 | 55 | 50 | +5 | 10.00% |

- **MAPE** = average of the sizes of the last column = 44.32% / 5 = **8.9%**
- **WAPE** = total size of errors / total actual = 22 / 246 = **8.9%**
- **Bias** = average of the signed last column = 16.15% / 5 = **+3.2%** (positive means forecasting too high)
- **Naive benchmark**: "next drop = last drop's actual", scored the same way on drops 2 to 5: 4/50, 2/52, 4/48, 2/50 = 8%, 3.85%, 8.33%, 4%, average **6.0%**

Here the naive guess beats the forecast. That is a real possible result and the screen shows it rather than hiding it. Actuals of 0 are skipped and counted, never divided by.

### How to read the O1 screen

Start at the green box: **Make about 60 units** is the suggestion, built from the projected pre-orders plus the buffer for walk-ins, and you decide. Below it, the countdown says how long orders stay open. **Booked so far** shows Paid (solid green, firm) and Likely (striped amber, requests that probably will pay) as separate parts of one bar, with the spaces left after them; turned-away units appear in red when the drop was full. **Projected pre-orders** gives the range ("about 53 to 62") and puts the baseline and the pace projection side by side, so you can see whether this drop is running ahead of or behind the usual. The buffer choice changes only the walk-in allowance, never the pre-order numbers. **Planned share** says how much of the batch is already spoken for. **By flavour** helps with the mix, but the forecast itself is for the total. A finished drop shows its final demand instead, with the forecast made at the checkpoint next to what really happened. **Pilot metrics** at the bottom are the four numbers the pilot is judged on, with an honest note that they come from sample data.

### Check your understanding

1. A drop sold out at 70 with 9 units turned away. What is its demand, and why would the pace table leave it out?
2. It is 4.5 days before cut-off and the table says 35% at day 4 and 20% at day 5. What share does `paceShareAt` give, and what is the projection with 14 units paid?
3. Why does the snapshot ignore a payment made one hour after the checkpoint, even if O1 is opened two days later?
4. The buffer setting changes from Balanced to Never sell out. Which numbers on O1 change, and which stay the same?
5. Over 4 scored drops the forecast's MAPE is 8.3% and the naive benchmark is 6.0%. What does that tell you, and what would you check next?

Answers: (1) 79 units; turning people away cut off the late orders, so its arrival shape looks too early. (2) Halfway between: 27.5%, so 14 / 0.275 = about 51. (3) The forecast must only use what was known at the checkpoint, or its accuracy would be flattered. (4) The buffer and suggested production change; paid, likely, the projection and its range do not. (5) The forecast is not yet better than "same as last time"; check the bias (consistently low or high?) and whether more drops are needed before trusting either.


## 7. Deleting a customer's data, and consent that only grows

Two rules protect the customer after they have ordered: they can delete their details at any time (BR-DP2), and every reminder choice they make is kept as a new row, never edited (BR-R2).

### purgeCustomer: what "Delete my data now" changes

`purgeCustomer(customer, now)` in `server/domain/retention/purge.ts` is a pure function. It does not touch the database: it returns a description of what must change, and `applyPurge` in `server/services/retention.ts` carries it out in one transaction with the customer row locked. The same function will be used by `pnpm retention` for customers inactive for 6 months (BR-DP1, not built yet), so both paths delete exactly the same things.

What it says:

- **The customer row stays, but empty.** First name, phone and reminder choice become null, and `deleted_at` is set. The row is kept so orders and consent rows still point at something valid.
- **Orders are kept, anonymised.** Each order gets `customer_id` null and `address` null. Units, prices, dates and statuses stay, so planned share, the forecast and the pilot metrics do not change when someone leaves.
- **Every token is deleted.** Private links, sessions and reminder links. The session lookup and the link lookup also reject a customer with `deleted_at`, so even a token that somehow survived would not work.
- **Queued reminders are deleted.** Reminders already sent stay as the record of what was sent.
- **Consent rows are kept.** They are the proof of what the customer agreed to, and they hold no name or phone.

**Idempotent** means running it twice is the same as running it once. If `deleted_at` is already set, `purgeCustomer` keeps the first time instead of replacing it with now. Everything else it sets is already null or already gone, so the second run changes nothing. That matters because a nightly job may meet a customer who already deleted their own data.

### Worked example

Ama paid for 2 bottles for delivery to "12 Sample Street", opted in to WhatsApp reminders, and has a reminder queued for the next drop. On Monday she taps **Delete my data now** and confirms.

| Before | After |
|---|---|
| Customer: Ama, +233 20 000 0012, WhatsApp, every drop | Customer: all null, `deleted_at` Monday |
| Order: Ama's id, 12 Sample Street, 2 bottles, paid | Order: no customer, no address, 2 bottles, paid |
| Link token and session token | None |
| Queued reminder for the next drop | None |
| Consent: opt_in, WhatsApp, every drop | Unchanged |

Her browser's cookie is cleared in the same response. Her old link now lands on "This link no longer works". O1 still counts her 2 bottles.

### Consent is append-only

`consent_events` only ever gets new rows. The customer's current state is read from the **latest** row: none yet, declined (they chose None), opted in, or stopped. Nothing is updated in place, so the history of every choice survives, which is what proof of consent needs.

The rules (`server/domain/reminders/consent.ts`):

- C6, C7 and C9 can make a first choice, or turn reminders on after None.
- **Stop reminders** writes an `opt_out` row straight away.
- After a stop, an opt-in is refused unless it comes from **C9** (source `c9`), with the customer's own session. That is **Resubscribe**: a fresh, explicit opt-in with nothing preselected.
- No owner route can write a consent row, so the business can never turn reminders back on.

### Check your understanding

1. Why does the purge keep the customer row instead of deleting it?
2. A customer deletes their data, and the nightly retention job later meets the same customer. What happens to `deleted_at`, and why does that matter?
3. After a purge, which numbers on the owner's O1 screen change, and which stay the same?
4. A customer stopped reminders on C6. Where, and only where, can they turn them back on, and what row does that write?
5. Why is "update the customer's latest consent row" not allowed, even though it would be simpler?

Answers: (1) Orders and consent rows still need a valid reference, and the row now holds nothing personal. (2) It keeps the first deletion time, because `purgeCustomer` is idempotent; a second run must not rewrite history or fail. (3) None of the unit numbers change: the orders are kept, only unlinked from the person. (4) On C9 Manage, with their own session (source `c9`); it writes a new `opt_in` row, and the earlier `opt_out` stays. (5) Consent is proof: editing a row would erase what the customer agreed to before, so every change is a new row.
