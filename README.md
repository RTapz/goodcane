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
| `pnpm test:api` | API test: builds the app and calls it against the seeded database (run `pnpm seed` first, about a minute) |
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
