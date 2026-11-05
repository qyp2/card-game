# Readability Gate

**Status:** Current · **Date:** 2026-11-03

> Two mechanical gates that keep the engine readable as it grows: a **ratcheting
> readability test** and a **ratcheting coverage threshold**. Both run inside
> `npm run verify`, so CI enforces them on every push and pull request.

Related reading: [`design-principles.md`](design-principles.md),
[`architecture-import-policy.md`](architecture-import-policy.md) (the sibling
gate for dependency direction).

---

## Why a gate at all

A style guide that lives only in prose is enforced by whoever remembers it. The
engine was reformatted once by hand — 76 files, zero behaviour change — and the
obvious risk is that the next 76 files drift back. These gates make drift a
build failure instead of a review comment.

Both gates **ratchet**: the budget is the current measured count, and it may only
go down. Raising a budget is the failure mode the gate exists to prevent, so a
raise should be treated as a deliberate, reviewed decision — never a quick fix to
unblock a branch.

The one exception is a merge that brings in code the budget was never measured
against. A budget is a count over a file set; when the file set grows, the count
is no longer comparable. Re-measure and record why in the budget comment, then
pay the difference down like any other debt. That happened on 2026-11-03, when a
long-lived branch added 36 engine files, and again on 2026-11-04, when that
branch was merged and its own formatting pass brought the counts back down — see
[Current budgets](#current-budgets).

---

## Gate 1 — readability rules

**Files:** `tests/architecture/readability.ts` (scanner),
`tests/architecture/readability.test.ts` (budgets + self-tests).

The scanner parses each file with the TypeScript compiler API and reports four
findings. It is pure — `scanSource(text, fileName, relativePath)` takes text and
returns findings — so the rules are unit-tested against inline fixtures rather
than against the real tree.

| Rule | What it flags | Why it is checkable |
|---|---|---|
| `max-line-length` | Any line over 140 characters | Pure text; 140 is the width of a split editor |
| `nested-ternary` | A `ConditionalExpression` whose `whenTrue` or `whenFalse` is also a `ConditionalExpression` | The style guide asks for an `if` block; nesting is where `?` stops being scannable |
| `else-after-return` | An `IfStatement` with an `else` where the `then` branch always exits | The `else` adds indentation for no reason |
| `undocumented-export` | An exported `function` or `method` with no leading `/** */` block | The style guide asks for comments "on function level" |

### Scope decisions

- **`undocumented-export` covers functions and methods only.** Types and
  interfaces are excluded on purpose: their shape *is* the documentation, and
  demanding a JSDoc line above every exported type produces noise. Including them
  would have raised the count from 33 to 175 — a budget nobody would ever pay
  down, which makes the rule decorative.
- **`else-after-return` uses `alwaysExits`**, which recurses through a block's
  last statement and through an `if` whose both branches exit. A `then` branch
  that merely *might* return does not make the `else` redundant, so it is not
  flagged.
- **Line length is measured on raw text**, not on AST node spans, so comments and
  string literals count. That is intentional: a 300-character comment is just as
  hard to read as a 300-character expression.

### Current budgets

Measured 2026-11-04 over `packages/engine/src`, after `platform/foundation` was
merged into `main` and the branch's own formatting pass landed:

| Rule | Count | Budget |
|---|---|---|
| `max-line-length` | 221 | 221 |
| `nested-ternary` | 41 | 41 |
| `else-after-return` | 0 | 0 |
| `undocumented-export` | 20 | 20 |

The previous baseline (380 / 46 / 0 / 33) was measured on `main` alone, which
did not contain the 36 engine files the branch added. A budget is a count over a
file set, so it stopped being comparable the moment the file set grew. Once the
branch was merged and reformatted, the real counts came in well below that
baseline, and the ratchet was lowered to match. Every number here is measured,
never assumed.

`rules/schema/contracts.ts` went from 39 long lines to zero in that pass. The
remaining long lines are spread thinly across 52 files:

| File | Long lines |
|---|---|
| `engine/game-reducer.ts` | 21 |
| `engine/game-engine.ts` | 20 |
| `engine/state-based-planner.ts` | 17 |
| `engine/characteristic-layers.ts` | 13 |
| `rules/schema/characteristics.ts` | 8 |
| `engine/trigger-manager.ts` | 8 |
| `engine/effect-registry.ts` | 8 |
| `engine/replacement-rules.ts` | 8 |
| `engine/resolution-planning.ts` | 7 |
| `shared/numeric-values.ts` | 7 |
| `engine/trigger-scheduler.ts` | 7 |
| `types/game-mutation.types.ts` | 6 |
| `shared/target-legality.ts` | 6 |
| `rules/schema/event-replacements.ts` | 5 |
| `engine/announcement-values.ts` | 5 |
| `rules/runtime/event-replacements.ts` | 4 |
| `shared/action-modes.ts` | 4 |
| `engine/trigger-matching.ts` | 4 |
| `types/game-event.types.ts` | 4 |
| `engine/handlers/play-card-handler.ts` | 3 |
| `engine/combat-service.ts` | 3 |
| `shared/rule-condition-matcher.ts` | 3 |
| `rules/runtime/costs.ts` | 3 |
| `engine/resolution-choices.ts` | 3 |
| `rules/runtime/active-rules.ts` | 3 |
| `engine/scenario-setup.ts` | 3 |
| `types/proposed-event.types.ts` | 3 |
| `shared/action-description.ts` | 3 |
| `types/state-based.types.ts` | 2 |
| `engine/target-groups.ts` | 2 |
| `engine/handlers/declare-blockers-handler.ts` | 2 |
| `engine/library-operations.ts` | 2 |
| `types/trigger.types.ts` | 2 |
| `engine/handlers/declare-attackers-handler.ts` | 2 |
| `engine/choices.ts` | 2 |
| `engine/combat-rules.ts` | 2 |
| `types/numeric-value.types.ts` | 1 |
| `engine/rule-conditions.ts` | 1 |
| `engine/numeric-characteristics.ts` | 1 |
| `engine/state-machine.ts` | 1 |
| `types/continuous-effect.types.ts` | 1 |
| `rules/operation-stage.ts` | 1 |
| `shared/choice-diagnostics.ts` | 1 |
| `shared/target-utils.ts` | 1 |
| `config/index.ts` | 1 |
| `engine/handlers/activate-ability-handler.ts` | 1 |
| `shared/effect-scope-validation.ts` | 1 |
| `engine/announced-distributions.ts` | 1 |
| `engine/zone-transitions.ts` | 1 |
| `engine/permission-registry.ts` | 1 |
| `engine/turn-history.ts` | 1 |
| `types/rule.types.ts` | 1 |

Paying that debt down is tracked separately; the ratchet still prevents any
further growth in the meantime.

### Regenerating a budget

Set the budget to `0` and read the actual count from the failure message:

```
AssertionError: max-line-length: 264 findings, budget 0 (+264).
```

Then set the budget to the reported count. Do this only when the count went
**down** — that is the ratchet clicking forward.

### Failure output

A failure names the worst files and the first ten findings, so the message is
actionable without opening the test:

```
max-line-length: 265 findings, budget 264 (+1).
Worst files: packages/engine/src/engine/game-engine.ts (12), ...
First findings:
  packages/engine/src/engine/game-engine.ts:412  max-line-length  187 chars
```

---

## Gate 2 — coverage threshold

**Files:** `vitest.config.mts` (config), `package.json` (`test:coverage` script).

```powershell
npm run test:coverage
```

Runs every vitest project with the v8 provider and writes `coverage/` (text,
HTML, and `coverage-summary.json`). The threshold block fails the run when
coverage drops below the frozen floor.

### Scope

Coverage is measured over the modules that carry logic worth asserting on:

| Included | Why |
|---|---|
| `packages/engine/src` | The rules engine — the densest logic in the repo |
| `packages/protocol/src` | Wire schemas; a silent change here breaks every client |
| `packages/ui/src` | Shared presentational helpers |
| `packages/browser-session/src` | Session/CSRF state machine |
| `apps/server/src` | Request handling, persistence, auth |
| `apps/game-client/**/*.ts` | Stores, reducers, layout maths, targeting |

Excluded on purpose:

- **`**/*.tsx`** — see below.
- **`**/types/**`** — type-only modules compile to nothing.
- **`packages/engine/src/engine/numeric-values.ts`** — a one-line re-export shim.

### Why JSX is not covered

Every vitest project runs under `environment: 'node'`, so a component test can
only assert on a string produced by `renderToStaticMarkup`. A high number there
measures how much of the render function executed, not whether the output was
correct — it is a snapshot test wearing a coverage badge.

Measured 2026-11-03, the client's 23 `.tsx` files sat at 69.93% lines while its
`.ts` files sat at 82.28%, and the gap was concentrated in shell files
(`main.tsx` 0%, `AccountControls.tsx` 19%, `Home.tsx` 25%, `StartScreen.tsx`
32%, `App.tsx` 37%) whose job is wiring, not logic. Chasing those numbers would
mean asserting on markup, which is exactly the kind of test that gets rewritten
every time a class name changes.

The UI is gated by the two-tab smoke test instead — see
[`playwright-smoke-testing.md`](playwright-smoke-testing.md).

### Current thresholds

Measured 2026-11-03 over the scope above (182 files):

| Metric | Measured | Threshold |
|---|---|---|
| Lines | 94.08% | 93 |
| Statements | 90.29% | 89 |
| Functions | 93.17% | 92 |
| Branches | 86.28% | 85 |

Each threshold sits one point below its measurement so ordinary noise cannot fail
the build, while a real regression still does.

Per area, for orientation:

| Area | Files | Lines | Statements | Functions | Branches |
|---|---|---|---|---|---|
| `packages/protocol` | 15 | 100% | 100% | 100% | 98.80% |
| `packages/engine` | 101 | 95.43% | 92.34% | 95.34% | 88.09% |
| `packages/browser-session` | 1 | 95.92% | 90.22% | 80.00% | 87.10% |
| `apps/server` | 46 | 94.54% | 90.06% | 94.44% | 86.00% |
| `apps/game-client` | 18 | 82.28% | 76.18% | 76.88% | 68.12% |

`apps/game-client` is the weakest area and the one to watch. Its low branches
number is concentrated in `hooks/useSocket.ts` (20%), `store/deltaReducer.ts`
(34%), and `socket.ts` (26%) — all three are thin wrappers around a live socket,
which is why the smoke test exists.

### Why one global threshold, not per-file

A per-file floor sounds stricter but is worse in practice: it forces a test for
every trivial module, and it makes the gate fail for reasons unrelated to the
change under review. A global floor has the opposite weakness — a 0%-covered file
can hide behind a 100%-covered one — so it is paired with review, not a
substitute for it. The per-area numbers are printed on every run, which is enough
to notice a module drifting.

### Why coverage is a weak gate on its own

Coverage proves a line *ran*, not that its result was *checked*. Two mutation
experiments on `packages/engine/src/engine/effect-scopes.ts` made the difference
concrete:

| Mutation | Coverage | Tests | Verdict |
|---|---|---|---|
| Invert a guard (`!==` → `===`) | unchanged | 20 failed | Caught |
| Extract a variable out of a short-circuit chain | unchanged | 1166 passed | **Not caught** |

The second mutation is not a bug — it is the exact rewrite a readability pass
wants to make. But it shows that a green suite is a *sample* of behaviour, not a
*proof*. That is why the reformatting pass was gated by an AST-equivalence
comparison rather than by tests, and why coverage here is a floor against
untested new code, not a substitute for review.

---

## Running the gates

| Command | What it runs |
|---|---|
| `npm run test` | Full suite, including both architecture gates |
| `npm run test:architecture` | Import-boundary test only |
| `npm run test:coverage` | Full suite with coverage thresholds |
| `npm run verify` | `typecheck && test && build` — what CI runs |

The readability test lives under `tests/architecture/`, which the `architecture`
vitest project already includes, so `npm run test` picks it up with no extra
wiring.

---

## Adding a rule

1. Add the rule name to the `ReadabilityRule` union in `readability.ts`.
2. Add an empty array for it in `emptyReport()`.
3. Implement the check inside the `visit` callback (or the text scan for
   text-only rules).
4. Add a positive and a negative fixture test in `readability.test.ts`.
5. Measure the real count, then set the budget to that count.

Keep each rule narrow. A rule that flags a matter of taste will be disabled
within a month; a rule that flags a shape which is *always* worth a second look
will survive.
