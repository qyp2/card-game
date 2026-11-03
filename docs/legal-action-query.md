# Pure legal non-pass action query

Implemented 2026-11-03. Source: packages/engine/src/engine/legal-actions.ts. This implements the engine query proposed in the [room lifecycle and auto-pass assessment](room-lifecycle-and-auto-pass.md); the [opt-in five-second auto-pass coordinator](auto-pass-controls.md) now consumes it.

## API and contract

```ts
import { hasLegalNonPassAction } from '@card-game/engine/engine/legal-actions';

const result = hasLegalNonPassAction(room, playerId, { maxNodes: 512 });
switch (result.kind) {
  case 'available':
    // result.action = { actionId, data }: a complete, handler-validated witness.
    break;
  case 'none':
    // All supported ordinary gameplay candidates were rejected exhaustively.
    break;
  case 'unknown':
    // Never authorize auto-pass: the position is not ready or search is incomplete.
    break;
}
```

The function reads authoritative room data without changing it, executing an action, opening a live choice, emitting mutations/events, consuming usage, allocating UUIDs or reading randomness/time. Witnesses are illustrative legal selections, not instructions to play them automatically; they must be revalidated against current state before use. Full room inputs and private witnesses belong on the server, not in opponent/public projections.

The domain is ordinary built-in casting from hand, land plays, battlefield mana abilities, and non-mana activated abilities from supported hand/battlefield sources, including effective granted abilities. Concede, pass, debug/turn shortcuts, RPS and combat declarations are deliberately excluded. An application with custom registered gameplay actions must also query those extensions; this function alone cannot certify their absence.

## Reused rules and bounded exploration

Candidate discovery uses effective characteristics and the existing mana-ability classifier. It does not trust OptionService previews or a mere nonempty hand. For each candidate, prepareActionChoice describes the same announcement prompts used by the engine. The query enumerates answers, validates them with validateChoiceAnswer, folds them with applyActionChoice, and repeats preparation in continuing mode until complete. Only the ordinary action handler's successful validation produces an available witness.

This reuses current casting/activation permissions, timing, targets and target groups, modes, alternative/additional costs, discard selection, distributions, floating-mana payment, numeric bindings, cast modifiers and ability-use limits. Ordered selections cover order-sensitive modes and targets. Optional effects chosen during resolution need not be executable now to make casting/activation legal; availability concerns the action's announcement, not whether it will eventually have a useful effect.

A payable mana activation itself proves an available action. The query need not simulate chaining mana abilities into a later cast: the first such activation is already a legal non-pass action. It never spends that mana. Disabled or exhausted mana abilities do not provide a witness.

Exploration is bounded to 512 nodes by default; callers may choose an integer from 1 to 8192. Selection/allocation recursion and announcement depth are capped at 32. Numeric prompts sample up to 32 consecutive values from their minimum. If a finite range is larger, or its maximum is open, failed samples return unknown rather than a claim that all values failed. Resource/depth exhaustion likewise returns unknown. An available witness wins even if an earlier branch was incomplete, provided the remaining budget permits finding it. Finishing the last exhausted candidate exactly at the budget boundary may prove none; unexamined candidates always require unknown.

Unknown reasons are not_ready, search_limit, number_range_limit and unsupported_choice. Unexpected invalid content/plugin exceptions remain errors, never evidence of no action.

## Safe call window

The room must be playing and unfinished, idle in waiting_for_player, owned by a seated player with priority, and have no pending choice, trigger queue, queued trigger mutations or required combat declaration. Otherwise the answer is unknown/not_ready. Even a player who can concede during a choice must not auto-pass that choice.

Because this is a room-only query, the caller must additionally ensure the engine's private rules checkpoint/collector is settled before calling. A future auto-pass coordinator must recheck that, connection/preference and current state before invoking pass_priority. The subsequent auto-pass coordinator owns opt-in UX, connection checks and a fresh five-second timer for each pass; this pure query still changes no game state.

## Verification

Focused logic tests check frozen-input purity/determinism and actual engine execution of returned witnesses. Cases cover empty priority/stack windows, free spells and abilities, colored mana, tapped/sick/opponent mana sources, hand activation, land allowances, instant/sorcery timing, use limits, missing/hexproof targets, multiple groups, modes, alternative/additional costs, finite/open X ranges, cast modifiers, distributions, gating and exact resource-budget boundaries. Existing cost-route, target-group and numeric-announcement regressions and the import boundary gate are included.

No smoke test, long socket scenario or full suite is required. The existing moved checkout contains unrelated untracked duplicate files, so readability is also checked against tracked engine sources plus the new query without raising any budget or modifying the duplicates.

Verification: 152 passing focused tests across nine files (including the temporary tracked-source readability check), all TypeScript projects and the server build. Existing duplicate files remain untouched; no readability budgets were raised.
