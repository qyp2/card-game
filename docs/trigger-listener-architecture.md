# Explicit triggered-ability listeners

Two card-listener discovery policies and independent delayed registrations share one trigger evaluator and scheduler. A **listener** is the card holding an ability, the **subject** is what the event happened to, and the **cause** is the action/card/effect responsible. They are separate identities.

## Contract

A card reacting to its own mill uses its library incarnation immediately before the move:

```json
{
  "id": "self-milled",
  "type": "triggered",
  "triggerCondition": "ON_DISCARD_FROM_LIBRARY",
  "trigger": {
    "listener": { "kind": "event_card", "state": "before", "zones": ["library"] }
  },
  "effect": { "family": "resources", "operation": "adjust_life", "params": { "amount": 2 } }
}
```

A battlefield observer of another card being milled uses an explicit watcher:

```json
{
  "id": "watch-mill",
  "type": "triggered",
  "triggerCondition": "ON_DISCARD_FROM_LIBRARY",
  "trigger": {
    "listener": { "kind": "watcher", "activeZones": ["battlefield"] },
    "subject": "another",
    "controller": "self"
  },
  "effect": { "family": "resources", "operation": "adjust_life", "params": { "amount": 2 } }
}
```

`event_card` requires `state: before | after` and a nonempty, unique `zones` list. The selected snapshot supplies the listener's effective abilities, controller and source characteristics. Its subject is intrinsically self: omitted or explicit `self` is accepted; `another` and `any` are rejected. For an after-mill listener use `state: after, zones: [graveyard]`; this is a new incarnation, not an old library card occupying two zones.

`watcher` requires a nonempty, unique `activeZones` list. Supported zones are battlefield, hand, library, graveyard, exile and actual spell cards on the stack. Ability stack objects are not additional card instances. An observer never acquires permission to listen from another zone through the old battlefield scan. Existing subject/controller/cause/type/subtype filters still apply; specify `subject: any` or `another` for a general card-event observer rather than relying on the existing self default.

Both schemas are strict discriminated unions in the shared raw and normalized ability validators. `TriggerListener` is inferred from that same schema, and the public rules parsing boundary exports the validator/type. Unknown fields, duplicate/empty/unknown zones and fields belonging to the other kind fail validation. Player/step/batch events without one card subject (life gain/loss, shuffle, upkeep, end step, combat-damage completion) require a watcher. The existing event vocabulary determines the subject: for `ON_KILL` it is the victim; the killer belongs in `cause`. No new event is invented by this schema.

## Event windows and execution

- Event-card before/after snapshots come from committed event contexts. Departures prefer retained source information, including simultaneous deaths and damage from a source that has already left. After-state exists only for a real occupant: a destroyed token has a before listener and no graveyard after listener.
- Watchers retain the engine's event window: before for permanent departure/death/destruction/kill events, after for other events. A departing battlefield observer therefore still sees its own departure. `activeZones` describes the listener's presence in that window, not a new lifetime registration.
- Listener snapshots determine ability ownership, source characteristics and event-card type/subtype filters. Board/player conditions use the state immediately after the event, including the milled card's actual graveyard arrival. Event history and queued turn/game usage reservations come from that same event point. For example, a before-library listener sees its old source characteristics while a five-card graveyard condition counts the newly milled card as the fifth.
- Reveal completion retains capture-time card snapshots, independently of the revealing source snapshot. Reveal does not move the observed object, so both states reference the same observed incarnation. Existing completion-time reveal notification timing is preserved. This does not introduce immediate mid-resolution triggers or private-reveal rules.

Discovery returns ordinary pending triggers. One evaluator checks all source families' filters, conditions, intervening-if, required-target eligibility and shared-per-event behavior; one coordinator reserves usage and sends them through existing ordering, modes, targets and stack resolution. Effective granted abilities are discovered too; their origin-qualified IDs distinguish different grants. The room retains serializable source information and small `triggeringEvent.subject.before/after` references (UUID, zone/revision, owner/controller); the original payload and cause remain available separately.

Discovery deduplicates identified abilities by listener incarnation and ability ID. Pending delivery additionally carries a serializable `triggerKey` including event UUID, source family and listener/ability identity, checked in the collector, trigger queue and stack **before** usage is reserved. Independent delayed registrations include their registration IDs. This is pending-event deduplication, not an unlimited replay ledger after a trigger resolves. Synthetic events without event UUIDs cannot receive delivery deduplication.

The coordinator stores no per-card subscriptions or executable callbacks in room state. Conservative cached metadata from immutable definitions chooses candidate watcher zones; actual effective abilities remain authoritative. Candidate hints are cached by definition and trigger event; a reveal listener cannot expand a life-loss scan into the library. These hints only bound candidate enumeration, while effective abilities decide admission. Watcher characteristic queries share one short-lived evaluation cache.

## Compatibility, visibility and boundaries

All 59 shipped ordinary trigger declarations, including grants, now declare their listener. Existing reveal self-claim/discard recipes deliberately use current-instance watchers in library/hand: a card selected into hand must act on that hand incarnation. Historical event-card listeners remain available when a recipe needs the actual observed snapshot. These are separate authoring choices rather than UUID-based retargeting.

Older saved/in-memory definitions without `trigger.listener` retain event-specific admission through a small adapter in the same candidate collector. They share the same facts, evaluator, eligibility and accounting; there is no second trigger executor. Their condition predicates follow the after-event rule too. `onEnterEffects` stays authoring shorthand and becomes an ordinary candidate, with its identity distinct from an authored ability named `on-enter`. Independent delayed registrations continue to own their retained source/lifetime; an explicit discovery listener inside `triggers / delay` is rejected rather than accepted and ignored.

Listening never moves a card or changes base visibility/observation audiences. Hidden cards are available to authoritative rules without making the rest of a zone public. Trigger presence follows existing stack presentation; source identity still follows the existing visibility policy (for example an opponent cannot see a hand-source identity merely because it triggered). Listener declarations do not reveal a source. Authors must explicitly use the existing observation/reveal consumers when a card requires disclosure; concealing the existence of a trigger would require a separate policy.

This clears the source-discovery dependency for self-discard/self-mill, hand-zone life-loss watchers and retained revealed-card listeners. It does not implement the affected workbook cards or certify their complete recipes. Tap/draw-step events, selected-result value accessors, event-subject targeting, healing modifiers and wording decisions remain separate dependencies.

## Eligibility, history and usage

A matching event alone does not create a pending ability. Before queueing or recording any use, the shared preparation query must prove that every required target group is satisfiable, including permissions and divided-effect bounds. A modal trigger needs at least one complete legal mode set. The scheduler uses those same group bounds, offers viable modes and rejects incompatible submitted combinations. Optional targets, untargeted effects and area effects remain eligible when no opposing card exists.

If no legal required target exists, no pending ability, occurrence record, budget debit or one-shot delayed-registration removal is produced. A later event can still use the ability. Once an eligible ability has been accepted, ordinary later changes can invalidate it during scheduling/resolution; this does not refund its accepted occurrence. Discovery remains a pure query; only the coordinator commits records.

Occurrence history and limits have different purposes. Unlimited abilities still record occurrences for history predicates and mana cause identities. Explicit turn/game budgets use their own declared scope/group and debit once. The three shipped `limitPerTurn` declarations now use ordinary turn/incarnation `usage`. Older saved definitions can retain both spellings: one shared counter query enforces every constraint, preserving old occurrence-key spelling and saved history. Activations, mana production and triggers share the commit helper. Effective control is used for controller-scoped availability and recording.

## Helper responsibilities

| Owner | Responsibility |
|---|---|
| `engine/trigger-events.ts` | One event table for trigger mapping, watcher window, subject transition, defaults and old-data admission |
| `engine/trigger-event-context.ts` | Subject snapshots/references once per event; keeps listener windows separate from after-event condition state |
| `engine/trigger-listeners.ts` | Enumerates live, historical and registered sources; does not evaluate conditions or spend uses |
| `engine/trigger-manager.ts` | Common matching, eligibility and deduplication; coordinates accepted occurrences into queue mutations |
| `engine/trigger-preparation.ts` | Pure mode/target feasibility and shared group bounds, reused by discovery and scheduling |
| `engine/trigger-scheduler.ts` | Controller ordering, legal selections, target pinning and distributions; existing immediate/stack execution |
| `engine/ability-usage.ts` | Common availability, pending reservations and occurrence/budget commits |
| `shared/card-identity.ts`, `shared/ability-identity.ts` | Current card-object equality versus stable saved occurrence-key spelling |

The former `REVEAL_TOP` operation remains a recipe that expands into capture/move/reorder instructions. Functional action spellings and effect-resolver exports remain compilation/re-export adapters. Token existence remains a movement rule. These do not require parallel execution pipelines.

## Original listener delivery verification

The 42 tests in `tests/engine/trigger-listeners.test.ts` cover strict parsing, both mill windows, retained identities/conditions, JSON recovery, hand/graveyard/library/exile watchers, token death without occupancy, granted abilities and trigger ordering, shared-per-event behavior, usage reservation, reveal-then-mill retention, delayed-registration separation and pending-delivery deduplication. Existing trigger, source, reveal/window and token tests provide regression coverage. No long socket test or full suite is required for this delivery.

Delivery validation: 218 distinct focused checks passed across the selected 14 test files (the 216-check regression run plus two final visibility cases), and the workspace typecheck passed. Tracked engine source meets the existing readability budgets: 209 long-line findings (budget 221), 41 nested ternaries, zero else-after-return findings and 20 undocumented exports. The unmodified whole-directory readability test also scans the local untracked backup copies and still fails; no backup files or gate budgets were changed. The previous full-suite failures remain outside this delivery's verification scope.

## Consolidation verification — 5 November 2026

The cleanup migrates 59 trigger and three equivalent turn-limit declarations across 43 card files. A structural comparison against the parent commit verified that no instruction content, cost, statistics or other card fields changed. Exact catalog hashes for the declared metadata migration are recorded separately in the baseline fixture; original hashes are retained, and preset hashes remain unchanged. New focused pipeline tests cover the owner rulings, common event facts for all source families, impossible/optional/area targets, permissions, mode combinations, distributions, delayed registration retention, combined old/new budgets, effective control and entry identity. The task uses focused logic tests and workspace typechecks; no browser smoke, full socket match or full suite is needed.

Final consolidation checks: **439 passed, zero failed/skipped across 26 focused test files**, including the 22 new pipeline cases; the combined run took 59.4 seconds. All workspace typechecks passed. Tracked engine readability is within existing budgets (200 long-line findings, 41 nested ternaries, zero else-after-return findings and 20 undocumented exports). No gate budgets or local backup files were changed. The whole-directory scanner's pre-existing inclusion of untracked backup copies remains outside this cleanup. No full suite or long socket match was run.
