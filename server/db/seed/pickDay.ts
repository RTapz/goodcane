/**
 * Picks which day before cut-off a paid order arrives on (spec section 9).
 *
 * TODO (Ryan): implement the weighted random choice.
 * - `rand()` returns a number in [0, 1), like Math.random, but seeded so runs repeat.
 * - Return a whole number d from 0 to 5. Day d is the 24-hour bucket
 *   [cut-off minus (d+1) days, cut-off minus d days), so 5 is the earliest bucket
 *   and 0 is the final day before cut-off.
 * - Shares per day: d=5 20%, d=4 15%, d=3 25%, d=2 20%, d=1 12%, d=0 8%
 *   (the cumulative pace table 20, 35, 60, 80, 92, 100 turned into daily shares).
 * - Call rand() exactly once per pick, so the rest of the seed stays reproducible.
 *
 * Until then it always returns 5, which makes the seed's pace check fail on purpose.
 */
export function pickDay(rand: () => number): number {
  void rand
  return 5
}
