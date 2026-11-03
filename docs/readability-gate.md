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
pay the difference down like any other debt. That happened once, on 2026-11-03 —
see [Current budgets](#current-budgets).

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

Measured 2026-11-03 over `packages/engine/src`, after `main` was merged into
`platform/foundation`:

| Rule | Count | Budget |
|---|---|---|
| `max-line-length` | 380 | 380 |
| `nested-ternary` | 46 | 46 |
| `else-after-return` | 0 | 0 |
| `undocumented-export` | 33 | 33 |

`max-line-length` was re-baselined from 264 to 380 in that merge. The branch
added 36 engine files that had never been through a readability pass, so the
raise is new code rather than a weakened rule. `nested-ternary` and
`undocumented-export` were paid back to their original budgets in the same
merge. The remaining long lines are concentrated in the new files:

| File | Long lines |
|---|---|
| `rules/schema/contracts.ts` | 39 |
| `rules/schema/shared.ts` | 21 |
| `rules/schema/instructions.ts` | 11 |
| `rules/schema/characteristics.ts` | 7 |
| `rules/schema/compile.ts` | 6 |
| `rules/schema/event-replacements.ts` | 5 |
| `shared/card-query.ts` | 4 |
| `engine/resolution-results.ts` | 4 |
| `rules/runtime/event-replacements.ts` | 4 |
| `shared/rule-condition-matcher.ts` | 3 |
| `engine/scenario-setup.ts` | 3 |
| `rules/runtime/costs.ts` | 3 |
| `shared/card-collections.ts` | 2 |
| `rules/operation-stage.ts` | 1 |
| `rules/runtime/active-rules.ts` | 1 |

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
