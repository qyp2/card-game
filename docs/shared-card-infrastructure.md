# Effective costs, deck policy, usage and causal outcomes

Implemented on 4 November 2026. This extends the existing rule compiler, characteristic layers, shared deck validator, usage counters and replacement transaction. [Current card blockers](card-blockers-current.md) tracks the remaining card work.

## Effective cost and payment

`characteristics / MANA_COST` replaces the whole structured mana cost in the effective characteristic view. For example:

```json
{
  "id": "zero-in-graveyard",
  "family": "characteristics",
  "scope": { "self": true, "zones": ["graveyard"] },
  "operation": { "type": "MANA_COST", "mana": {} }
}
```

Place the rule in a static ability with `activeZones: ["graveyard"]` and the card's printed condition. The normal characteristic resolver supplies it to targeting, searches, numeric scopes, card projections and casting. `resolveManaCost` returns the structured value; `resolveManaValue` returns its total, or undefined for an unresolved variable cost. Numeric card views also expose `manaValue`.

Payment-only increases/reductions stay in the `costs` family. Casting starts from the effective cost and applies payment adjustments once. Printed blueprints remain unchanged, so catalog/deck-builder displays still describe the printed card. No casting permission follows merely from a graveyard cost rule.

Production consumers:

- **幻影木偶 (`phantom-puppet`):** printed one dark, 2/1; graveyard zero during its owner's attack phase with at least three friendly dark creatures; optional attack-triggered graveyard puppet deployment; twenty-copy deck exception.
- **幻影巨人 (`phantom-giant`):** printed four dark plus two generic, 5/5; graveyard base three dark plus one generic, zero with five qualifying creatures during its owner's attack phase; attack mills three before optional graveyard puppet deployment.

Both use existing special deployment. Ordinary graveyard casting remains unavailable.

## Owned deck-policy configuration

`packages/protocol/src/decks/config/standard-v1.json` owns format bounds/default copies. `eligibility.json` owns `unlimitedCopies`, `excludedCards` and numeric `copyLimits`:

```json
{ "copyLimits": { "phantom-puppet": 20, "phantom-castle": 1, "worlds-sea": 1 } }
```

`DeckEligibilitySchema` strictly parses the file. Duplicate/overlapping exceptions, invalid counts and unknown catalog IDs fail validation. `buildCatalog(policy)` compiles it into `copyLimit`/`deckLegal` fields; the builder and server use the same pure `validateDeck` over that catalog. Server save/start validation remains authoritative. Edit the owned file and rebuild/restart; the browser cannot submit its own replacement policy.

All six workbook basic lands are repeatable. `land-red` already covered 血炎山; this delivery adds the five missing unlimited exceptions. Existing profile bounds stay unchanged.

## Shared usage contract

Ordinary activated/triggered abilities now accept the same period and identity vocabulary as modifier rules:

```json
"usage": {
  "period": "game",
  "limit": 1,
  "identity": "source_card",
  "consume": "on_commit"
}
```

`period` is `turn` or `game`. Identity is `source_card` (physical UUID), `source_incarnation` (UUID plus zone revision), or `controller` (player plus card definition). An optional stable `group` shares a budget across abilities/rules. A controller identity with an explicit group shares that named budget across definitions for that player. Stable groups also avoid generated grant IDs splitting one intended budget.

The pure availability query reads `turnHistory.uses` or `gameRuleUses`. Ordinary actions, immediate mana activations, automatic mana planning and trigger enqueue all enforce the limit. Committed use records exactly once; checking options, invalid payment and cancellation before commitment consume nothing. Trigger enqueue is its commitment point: later countering/fizzling does not refund it. Pending simultaneous triggers reserve uses before another event can claim them.

A new match gets fresh counters. Refresh/reconstruction and ordinary turn changes preserve game-period counts. A physical-card identity survives leaving/returning; a new incarnation gets a new budget only when explicitly chosen. Existing `limitPerTurn` remains a compatible older declaration. Dynamic numeric limits and rewriting an ability's limit are still separate blockers.

## What history actually contains

| Data | Purpose and lifetime |
|---|---|
| `turnHistory.events` | Actual rules events this turn, including actual damage, characteristic changes and committed kill outcomes; reset at turn change |
| `turnHistory.uses`, `gameRuleUses` | Aggregated counters used for availability; game counters survive turn/zone changes according to identity |
| `causalState["UUID:revision"]` | Current creature incarnation's harmful contribution receipts, all contributor identities and lethal-making causes; removed when that incarnation leaves |
| `CREATURE_KILLED.payload.outcome` | Retains both contributor receipts and lethal causes after departure, plus victim identity/reason; its event survives in history/timeline |
| Committed event batches | Ordered changes with source/cause metadata and actual semantic outcomes, consumed by the existing timeline/log path |

These are engine rules data. Display log text is not queried to decide legality or credit. This delivery does not add an unbounded full-match event array to `GameRoom`.

Example: A reduces X's maximum life from four to three; B later deals three damage. The causal index records a one-point characteristic receipt from A and a three-point damage receipt from B. Its `contributors` contains A and B; `lethal` contains B. After X leaves, the kill outcome retains both lists and receipts. For simultaneous damage, one aggregate lethal transition retains all actual packet sources, independent of array order. Damage prevention changes the recorded actual amount.

This keeps facts separate from the owner's still-open broad kill-credit ruling. Current `ON_KILL`/killed-outcome matching uses the lethal-making causes; it does not retrospectively credit every earlier contributor. The data needed to review a different policy remains available. No broader credit ruling is implied by choosing this representation.

## Source, changes and kill behavior

`ChangeCause` is shared by mutations, applied events, damage assignments and trigger continuations. It carries stable cause/root/parent IDs, source snapshot, controller, ability, stack/instruction identity and triggering-event link. Rules-only changes can have a system cause without a card. Replacement provenance records the changing rule and its source separately from the damage dealer.

The reducer updates the causal index from actual before/after state, including damage, maximum-life reduction, counter-based Scorch lethality and indestructible transitions. Sources retain snapshots across sacrifice, departure and JSON reconstruction. `CHARACTERISTICS_CHANGED` reports the effective before/after views. All mutations retain their causal context through the existing commit/timeline boundary.

A card instruction can declare:

```json
"onKill": { "destination": "exile" },
"recordOutcome": { "name": "kill", "kind": "killed" }
```

`onKill` affects only kills attributed to that instruction. It changes the departure destination before committing a graveyard arrival. `recordOutcome: killed` requests a continuation-safe lethal settlement after the instruction; later instructions may use `requiresOutcome: "kill"`. Normal instructions retain the existing checkpoint timing. Replacement choices, prevention, regeneration, indestructibility, cancellation and stale objects still govern whether a kill actually happens. A return-to-hand replacement is not a successful kill; sacrifice is not a kill.

`ON_KILL` triggers can filter `trigger.cause` as `self`, `controller` or `any` (default self for kills). Kill events describe the victim in `payload.card`; their outcome identifies the cause(s). They are distinct from `ON_DIE`, which still requires an actual creature-to-graveyard departure. No SOUL death category was added. Optional zero-life rescue/healing is a different missing replacement behavior.

The causal index is server-only; existing player projections remain explicit and do not expose raw source snapshots or the index. Admin/internal room inspection and timeline consumers can inspect the contracts.

## Next largest blocker

The follow-up [counter and optional payment delivery](counter-payment-architecture.md) extends `planActionCosts` rather than adding another cost engine. It supports source/controlled-battlefield counter removal, ordinary costs inside optional resolution branches, and existing mana-ability choices. 幻影女王 赫拉 and 天使皇 亞拉里亞 are registered consumers. Exact payment and usage commit together; countering later does not refund them.

**Captured reveal workflows** are now the largest remaining family, affecting **13** missing cards. The gap includes retained larger windows, multiple filtered selections, take-all/distinct-name rules, deployment, remainder destinations/order and repetition. Selected exile, ritual materials and binding/storage still account for **five PAY rows**. Counts overlap; see the [current row-by-row ledger](card-blockers-current.md).

## Verification

Focused logic tests cover effective-cost filtering/payment/reversion, real phantom deployment, config validation/server saves, game-period usage/replay/reservation, causal receipts, shared damage batches, sacrifice/source departure, prevention/cancellation, counter-driven kills, direct exile, gated outcomes and replacement continuation reconstruction. Related projection, builder and import-boundary checks are included. No smoke test, long socket scenario or full suite is required for this delivery.

Verified: **231 selected logic checks across 18 files**, including the focused preservation gate; all workspace typechecks passed. Original card definitions and presets retained their baseline hashes.
