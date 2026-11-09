# Test coverage

The Vitest coverage scope is fully covered:

| Metric | Covered / total | Percentage |
| --- | ---: | ---: |
| Statements | 10,046 / 10,046 | 100% |
| Branches | 10,414 / 10,414 | 100% |
| Functions | 2,240 / 2,240 | 100% |
| Lines | 7,822 / 7,822 | 100% |

The suite reports **245 test files / 3,450 passing tests**. No file with executable
code is below 100%; eight files are type-only or re-export barrels and therefore
have `0/0` executable statements.

## Reproduce

```powershell
npm.cmd run test:coverage
npm.cmd run typecheck
```

`vitest.config.mts` now enforces `100` for all four metrics, so any regression
fails the build. The HTML report is written to `coverage/index.html`.

## What was added

The coverage work added 79 test files (1,292 tests) under `tests/`:

- `tests/engine/` — reducer and mutation commit paths, action/legal-action
  validation, effect registry and resolver, replacement and trigger handling,
  combat, costs, resolution choices/payments, card parser and rule contracts.
- `tests/server/` — real HTTP and Socket.IO flows, auth/session lifecycle,
  browser/admin routes, rooms, reconnect and auto-pass, deck store/service,
  scenarios and SQLite persistence, projection/view building.
- `tests/client/` — game store and delta reducer, targeting drafts, auth/session,
  React hooks, deck pagination, log storage, density planning and socket events.
- `tests/shared/` — protocol scenarios/editors/diagnostics and browser sessions.

No existing test was weakened or removed, and no coverage exclusion was added.

## Unreachable defensive branches

A small set of guards are unreachable under the engine/server invariants that
precede them: strict union/schema-required fields, exhaustive switches, terminal
room guards, and duplicate checks already decided by an earlier guard. Those
branches are annotated with `/* v8 ignore ... */` and an inline proof at the
call site (117 annotation lines across the touched modules). Every reachable
path is exercised by behavioural tests; suppressions are limited to code that
cannot be entered through the public APIs with valid state.

Three behaviour-equivalent refactors removed avoidable dead branches:

- `apps/game-client/auth-state.ts` — the private guest request helper no longer
  accepts an unused token.
- `packages/protocol/src/scenarios/scenario.ts` — `utf8Size` derives the code
  point once instead of four times.
- `packages/engine/src/engine/legal-actions.ts` — the schema-guaranteed
  distribution total is asserted rather than defaulted with `?? 0`.
