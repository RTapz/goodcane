# Walkthrough: pickDay and learnPaceTable

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
