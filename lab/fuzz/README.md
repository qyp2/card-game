# Stateful Socket.IO assessment — implementation slot

No scripts/dependencies installed. See [contract](../contracts/fuzzing.md) and [case matrix](../campaigns/case-matrix.md).

Planned: locked Python dependencies, client.py for valid setup, cases/ for independent mutations, run.py for bounded scope enforcement and separate valid-seed drift fixtures. Low-level malformed framing is separate from normal client events.

Results record case/run/target, safe request/response summary, expected/observed behavior, control and UTC time. Raw output is private; finding confirmation requires triage. No empty executable placeholders.

## Why a purpose-built client

Socket.IO is not WebSocket. It is a framing layer over Engine.IO: packet-type bytes,
namespaces, acknowledgement IDs, JSON payloads and an HTTP long-polling fallback. A generic
proxy can replay bytes but cannot *construct* a valid `playerAction` event, so it never reaches
the application logic where the findings live.

## Why Python rather than the repo's own client

The repository already depends on `socket.io-client` (`apps/game-client`) and `socket.io`
(`apps/server`), so a Node/TypeScript fuzzer would be less work. It would also reuse the same
client library and likely the same shared Zod schemas the server validates with — an attacker
that inherits the defender's assumptions can mask bugs. `python-socketio` is an independent
implementation of the protocol.

**Cost:** protocol knowledge is maintained in two places, and this directory can silently drift
from the real event contract. **Mitigation:** a contract test asserting that the fuzzer's event
names and payload shapes still match `packages/protocol`. Drift must fail a test, not surface
during a campaign.

## Belongs here

- `requirements.txt` — `python-socketio[client]`, `requests`, `rich`
- `client.py` — authenticated connection helper (reuses Phase 1 login)
- `cases/` — one module per test case
- `run.py` — runner that emits JSON results
- `contract.test.ts` (or equivalent) — asserts event names/payload shapes against `packages/protocol`

## Test cases

From the plan (Phase 5):

1. Malformed `actionId` values and unknown action names
2. `roomId` for a room the account never joined (IDOR)
3. Oversized payloads and deeply nested `data` objects
4. Rapid-fire actions (rate limiting, engine stability)
5. Replayed packet with a substituted `playerId`
6. Actions sent out of turn / without priority
7. `getOptions` for a card in another player's hand

## Output contract

Each case emits: case id, target, request summary, response summary, verdict
(`vulnerable` / `blocked` / `inconclusive`), and a timestamp. The runner writes one JSON file
per run so baseline and re-scan can be diffed.
