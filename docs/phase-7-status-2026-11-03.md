# Milestone 7 — Admin Test Lab completion report

**Date:** 3 November 2026. **Branch:** platform/foundation. Latest branch pulled before edits; existing UI work preserved. Scope is platform 7.1–7.7, using focused logic/render/short integration checks. No new gameplay rule or installed security infrastructure.

## Requirement audit

| Requirement | Delivered | Evidence |
|---|---|---|
| 7.1 separate lab and gates | Default-off lab config, loopback local command/profile, port 3001, separate identity/data/log paths, external operator bootstrap, capability requires lab+inspection, live refusal | Real config/profile policy cases, independent live/lab apps reject each other's credentials, existing database identity checks |
| 7.2 shared builder and admin routes | Shared catalog tile/count/transfer UI and engine-free catalog/count helpers; Scenarios/Test Rooms routes; app-owned network/session adapters | Standard builder/admin/navigation regressions and import graph; public artifacts exclude scenario admin API/editor code |
| 7.3 strict setup and persistence | Bounded canonical v1 fields, fixed/seeded order, supported starting zones/life/hand, existing rule profiles, migration 004 and optimistic revisions | Malformed/unknown/oversized/unsupported input cases, SQLite reopen/rollback, seeded semantic equivalence and independent IDs |
| 7.4 audited lifecycle and seats | CRUD/import/export/launch/reset/stop; immutable snapshots; normal game credentials claim only assigned account's generated player; revision/capacity guards | Short real HTTP/socket launch→claim→land→inspect→revise→reset/export, admin/sibling/unassigned denial, audit/storage rollback cases |
| 7.5 complete local workflow | Recoverable drafts, replacement/navigation prompts, cancellation/stale-read guards, source/revision/game context, inspector and bounded room-context logs | Focused server workflow, editor render/API signal/error tests, reused admin resources; no browser interaction claim |
| 7.6 fixtures and ownership | Five reviewed preset exports, exact library/opening/life/Scorch equivalence, ordinary defaults stop using fixture fallback, selected-deck setup decoupled | Direct checked-in fixture tests need no login/database; standard validator rejects nonstandard cards/deck; engine setup regressions |
| 7.7 documentation and operations | Architecture/ADRs, bootstrap/paths/API guide, schema/migration/rollback, import provenance, fixture promotion, audit retention limits and dependency/config policy | Linked docs, example config loader, artifact/whitespace checks and this audit |

## Verification

**272 passed, 0 failed across 23 focused files.** Includes 17 scenario server/contract/persistence cases and four scenario editor/API/route cases; these counts include the five preset equivalence cases, not additional uncounted tests. The remaining checks cover auth, browser sessions, decks, admin, SQLite, room/reconnect, client stores/controls, engine setup and import architecture.

All eight TypeScript projects pass and all four applications build. New checks are in tests/server/scenarios.test.ts and tests/client/scenarios.test.tsx. The ignored report build/m7-final.json holds the final run evidence. The affected gate deliberately excludes the long live-routing file and a full-suite run.

Reproduce:

```sh
npx vitest run tests/server/scenarios.test.ts tests/client/scenarios.test.tsx tests/server/browser-navigation.test.ts tests/server/configuration.test.ts tests/server/auth-core.test.ts tests/server/auth-acceptance.test.ts tests/server/deck-acceptance.test.ts tests/server/admin-acceptance.test.ts tests/server/admin-audit.test.ts tests/server/sqlite-store.test.ts tests/server/reconnect.test.ts tests/server/room-runtime.test.ts tests/client/navigation.test.tsx tests/client/auth-state.test.ts tests/client/deck-builder.test.tsx tests/client/admin.test.tsx tests/client/action-feedback.test.ts tests/client/socket-feedback.test.ts tests/client/gameStore.test.ts tests/client/decks.test.ts tests/architecture/import-boundaries.test.ts tests/engine/setup-mana.test.ts tests/engine/game-engine.test.ts --pool=threads --maxWorkers=2
npm run typecheck
npm run build
```

Short localhost tests required permission to connect to their own ephemeral loopback ports in this environment; the original restricted failures were EACCES, not application assertions. Subsequent assertion failures were fixed and the final full affected gate is green.

## Setup and limits

See [Scenario Lab architecture/setup](scenario-lab-architecture.md), [ledger](milestone-7-implementation.md) and [fixture guide](../tests/fixtures/scenarios/README.md).

Build, provision separate operator credentials externally and run npm run start:lab; use http://localhost:3001/admin/. Two assigned enabled lab accounts play through ordinary public game sign-in. The local entry binds loopback, has no tunnel and creates no Linux/network isolation guarantee.

Sources/provenance persist; runs/rooms/seats disappear at restart. Reset replaces the room ID from its launch snapshot, even if the source was removed. Already-present battlefield cards do not replay entry effects. Aura setup, arbitrary engine mutations/effect scripts, unsupported zones and arbitrary security/rule changes are rejected. Old fixture mode is retained explicitly for automated compatibility, not ordinary development defaults.

Migration 004 needs a matching pre-upgrade backup for rollback; the current backup helper can migrate the source it opens. Outbox/JSONL export and rotation remain existing infrastructure; SQLite audit retention/pruning remains operator deployment work. Browser visual interaction, Linux/TLS/proxy/Cloudflare deployment, load, IDS/pentest and installed host isolation were not tested or claimed.

Milestone 8's remaining UI/store/animation work is still separate; newer existing UI improvements were preserved. Historical completion reports retain their original claims and numbering.
