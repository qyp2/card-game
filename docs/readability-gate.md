# Readability Gate

**Status:** Current · **Date:** 2026-10-29

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

Measured 2026-10-29 over `packages/engine/src`:

| Rule | Count | Budget |
|---|---|---|
| `max-line-length` | 264 | 264 |
| `nested-ternary` | 46 | 46 |
| `else-after-return` | 0 | 0 |
| `undocumented-export` | 33 | 33 |

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

Runs the `engine` project with the v8 provider and writes `coverage/` (text,
HTML, and `coverage-summary.json`). The threshold block fails the run when
coverage drops below the frozen floor.

### Current thresholds

Measured 2026-10-29 over `packages/engine/src` (types and the `numeric-values.ts`
re-export shim excluded):

| Metric | Measured | Threshold |
|---|---|---|
| Lines | 94.43% | 94 |
| Statements | 91.36% | 91 |
| Functions | 94.04% | 93 |
| Branches | 86.45% | 86 |

Each threshold sits one point below its measurement so ordinary noise cannot fail
the build, while a real regression still does.

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
| `npm run test:coverage` | Engine suite with coverage thresholds |
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
