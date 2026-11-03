# Opt-in delayed auto-pass

Implemented 2026-11-03. The branch was pulled before changes. Uses the [pure legal-action query](legal-action-query.md).

## Player behavior

Room controls include an Auto-pass when no actions checkbox, off by default. Enabling sends an authenticated preference for the current room and waits for the server acknowledgment. A visible countdown appears only when the server has scheduled a pass. Every automatic pass waits a fresh five seconds. The preference is local to a live game socket; disconnect/refresh/reconnect and explicit room exit reset that player's preference to off. The user can turn it off during a countdown or while waiting for an eligible position.

Only the player currently holding priority can auto-pass. Both seats must have a current connected socket in this room. The engine must be settled and the query must prove none; available and unknown never authorize a pass. Mana abilities count as available actions. Pending choices, RPS, combat declarations, rules work and game-over positions never get auto-answered or skipped. The preference can be enabled during RPS but waits for a safe gameplay window.

## Server ownership

AutoPassCoordinator owns one timer per room and per-socket opt-ins. RoomRuntime supplies current socket membership, authoritative engine state, the settled-checkpoint guard, and the pure query. Committed commands and connection/departure events refresh eligibility. An unchanged eligible position keeps its deadline; state or priority changes cancel/restart the countdown with the full delay. Repeated identical preference messages are idempotent. Another player's toggle cannot reset the current player's deadline.

At expiry the coordinator checks its live timer identity, enabled preference, both connections, current priority owner, room-state object identity, settled engine and a fresh legality result. A stale/missing/ineligible position produces no pass. A changed but eligible position receives a new full delay. The coordinator calls the existing pass_priority command through RoomRuntime, preserving authorization, command context, ordinary mutations, logs and per-viewer deltas. Subsequent passes are separate timer callbacks, preventing synchronous empty-turn loops.

Disabling, leaving, room destruction, socket replacement and runtime disposal cancel applicable timers. Either player's disconnect cancels room work; a remaining connected player's opt-in may schedule a new full delay when the opponent reconnects. Legality exceptions fail closed and are logged on the server. A failed or throwing background pass disables that socket’s preference and reports the disabled state rather than escaping the timer or retrying indefinitely. The implementation uses the default built-in engine registry supported by the query.

## Protocol and configuration

Client setAutoPass accepts only protocolVersion, roomId and enabled through a strict shared schema. Clients cannot supply actors or deadlines. Runtime verifies the socket's current room binding, and existing middleware verifies session validity. Server autoPassStatus is sent only to that socket with enabled, passAt and serverTime. Browser deadlines are translated relative to receipt to avoid relying on synchronized clocks; countdown display never authorizes passing. Stale-room/malformed status packets are ignored.

apps/server/src/config/rooms.json sets autoPassDelayMs to 5000; the server configuration schema validates operator overrides and supplies a backward-compatible default. Delay is server-controlled, not a player packet field. The coordinator and RoomRuntime also default to five seconds for standalone logic fixtures.

## Verification

Fake-timer logic checks verify no default passing, the 4999/5000ms boundary, fresh five-second intervals, idempotency, independent toggles, stale positions, manual-pass restarts, disabling, disconnect/reconnect, membership denial, departure, disposal, game over, mandatory choices/declarations, available actions and unknown queries. Runtime tests verify real pass commands and published deltas. Client logic/render checks cover typed requests, acknowledged status, local clock translation, countdown rendering, stale-room rejection and disconnect cleanup. Existing room/runtime/configuration/query/import regressions are included. No browser smoke, long socket test or full suite is run. Pre-existing untracked duplicate source files remain untouched and excluded from the commit.

Final verification: 136 passing focused checks across nine files, all TypeScript projects and all four application builds. All timing tests use fake timers; no real five-second waits or long socket tests are required.
