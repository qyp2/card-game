# Concede, leave, refresh history and auto-pass assessment

Implemented 2026-11-03 on platform/foundation. The branch was pulled first. Source checkout now lives at C:/Users/shunm/Desktop/card-game.

## Match and room lifecycle

Concede is an authenticated engine command available to either seated player in playing/RPS, regardless of priority, combat declaration or pending choice. It records an explicit concede loss and opponent win through END_GAME. Finished games reject further concessions. Terminal state clears the stack, choices and queued triggers so incomplete resolution/result sets do not remain actionable. The UI offers Concede and Concede and leave during a match, and Leave room after completion or while waiting alone. Destructive match decisions have a short confirmation.

Concession alone keeps the result and game log visible. Explicit leave automatically concedes if necessary, publishes the result to the opponent, releases this socket's runtime binding and seat ownership, leaves its Socket.IO group, clears tab room/UI/log context, and navigates to /play. The user remains signed in. An empty lobby or a room with all participants departed is destroyed. A remaining connected opponent can inspect the result until leaving; a disconnected room retains bounded grace cleanup. Retiring an old room cannot unbind a player's newer room. Stale room-destroyed notices cannot clear a different current room.

Refresh/disconnection does not concede or release the seat. Existing reconnect grace and credential/seat verification remain. Explicit departures cannot rejoin through the old seat, and a detached or superseded socket cannot act on the old room. Public resume endpoints stop authorizing that seat when ownership is deleted. Test Lab seats use the same departure policy; scenario membership is not a bypass for the account reservation.

## One room per account

Seat ownership now retains accountId in addition to its tab-specific owner. Memory and SQLite adapters expose account seat lookup and individual seat deletion; rooms/seats remain ephemeral and no database schema migration is needed. Create/join and seat claiming enforce one account's reservation across all families/tabs. Sibling tabs cannot take a second seat in the same room. Guest-to-account linking checks the reservation too. Same-tab refresh/reconnect preserves its seat; disconnect grace and finished-but-not-left rooms continue to reserve the account. Explicit leave or room destruction releases it. A new signed-in tab alone does not reserve any room. Guest sessions remain independent.

## Refresh-safe game log

The game client stores only its existing display log in sessionStorage, keyed by game session ID, room ID and viewer ID. Board state is always restored from the authoritative server snapshot. Duplicate deltas are still rejected by sequence; restoration discards entries newer than the snapshot. History is capped at 100 entries, with configurable entry/summary limits in apps/game-client/config/ui.json. Corrupt, oversized, unavailable or full storage fails safely while the live in-memory log continues.

Explicit leave/session cleanup clears this tab's cached histories. Another room, viewer or game session cannot load the cache. This preserves events received before refresh; it does not fetch events missed while disconnected, provide cross-device history, or survive closing the tab. Server diagnostic logs remain separate.

## Auto-pass: analysis only

Existing GameEngine.passPriority / the pass_priority command already transfer priority, resolve the stack and advance phases using the normal rules. No new stack-resolution or turn engine is needed. However, an exact automatic pass when there is no legal non-pass action needs a new engine-owned legality query.

OptionService.getOptions is a UI preview. It checks timing, permissions and many payment constraints, but enabled spell/ability options do not prove a legal target assignment or a completable mode/number/alternative-payment choice. Conversely, an unaffordable spell may become payable through available mana abilities. Client-side hidden information and stale snapshots are further reasons not to make the browser authoritative. An empty hand alone proves nothing about battlefield abilities.

The pure query is now [implemented](legal-action-query.md). The remaining coordinator plan is:

1. Use hasLegalNonPassAction(room, playerId), which returns available with a witness, none after exhaustive rejection, or unknown when the position/search cannot be decided safely.
2. Only auto-pass for an opted-in connected player who currently owns priority in waiting_for_player, with no choice, trigger queue, rules work or required combat declaration. Mana abilities count as actions unless a separately named preference explicitly chooses to skip them.
3. Let the server call the existing pass_priority command only for a proven none result, rechecking current state immediately before execution. Preserve ordinary published mutations, logs and opponent response windows.
4. Bound passes per processing cycle, yield between cycles and stop on any new action/decision, changed preference or disconnect. Never repeatedly advance empty turns in an unbounded synchronous loop. Do not auto-answer targets, attackers, blockers, RPS or optional effects.
5. Test available mana, no legal targets, target groups, announced X, alternative costs, free abilities, pending choices, combat declarations, both players passing, stack changes and loop limits.

A conservative first version can skip only positions it can prove have no action and leave uncertain positions for manual play. Auto-pass is not enabled by this delivery.

## Verification

Focused logic tests cover terminal concession from RPS/playing without priority, pending-choice cleanup, invalid actors, explicit departure and reconnect behavior, successor-room binding, account reservations, storage isolation/refresh/sequence bounds/failure, client feedback and controls. Existing runtime, auth, SQLite, command and import-boundary tests are included. 146 focused checks across 12 files pass, including the temporary tracked-source readability check. Type checking and all four application builds pass. No smoke test, long socket scenario or full suite was run.

The moved working tree contains pre-existing untracked files named * - 複製.*. The ordinary readability scanner counts those additional copies and exceeds its budgets. A separate scan of tracked engine sources passes the existing budgets; no budgets were raised and those unrelated files were not changed or committed. Local test reports are under ignored build/.
