# GoodCane Drops

Before doing anything in this repo, read `docs/PROJECT_SPEC.md` and follow every rule in `.cursor/rules/goodcane.mdc`. Both are imported below so they load into every session.

- The spec is the single source of truth. If a request conflicts with it, stop, say so, and propose the spec change before writing code.
- The rules file applies in full, including the hard constraints, the learning boundaries (do not write `server/domain/forecast/*` or the seed's weighted day-picking unless Ryan asks in that message) and the style rules (British English, no em dashes anywhere).
- When a decision changes, update the spec first, then the code (and the rules file if a rule changes).

@docs/PROJECT_SPEC.md
@.cursor/rules/goodcane.mdc

## Project notes

- Package manager: pnpm. Scripts: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm seed`, `pnpm retention`.
- TypeScript is pinned to 6.x because `vue-tsc` cannot load TypeScript 7 yet.
- Drizzle is pinned to the stable 0.x line (`drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11) with `postgres` 3.4.9. The Drizzle website documents v1 by default; use 0.x conventions. Do not move to a release candidate without asking.
- Database: schema in `server/db/schema.ts`, migrations in `server/db/migrations`. Change the schema, then `pnpm db:generate`, review the SQL, then `pnpm db:migrate`. Never edit an applied migration.
- Run `pnpm typecheck` and `pnpm test` before calling any slice finished, and commit after each slice.
