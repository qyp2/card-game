# Explicit triggered-ability listeners

Two discovery policies share the existing trigger pipeline. A **listener** is the card holding an ability, the **subject** is what the event happened to, and the **cause** is the action/card/effect responsible. They are separate identities.

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
- Snapshot source conditions use that selected window; event history and queued usage reservations remain the committed event history. Event-card type/subtype filters use the selected snapshot, including observations retained through later changes.
- Reveal completion retains capture-time card snapshots, independently of the revealing source snapshot. Reveal does not move the observed object, so both states reference the same observed incarnation. Existing completion-time reveal notification timing is preserved. This does not introduce immediate mid-resolution triggers or private-reveal rules.

Discovery returns ordinary pending triggers. One evaluator checks filters, conditions, intervening-if and shared-per-event behavior; one coordinator reserves usage and sends them through existing ordering, modes, targets and stack resolution. Effective granted abilities are discovered too; their origin-qualified IDs distinguish different grants. The room retains serializable source information and small `triggeringEvent.subject.before/after` references (UUID, zone/revision, owner/controller); the original payload and cause remain available separately.

Discovery deduplicates identified abilities by listener incarnation and ability ID. Pending delivery additionally carries a serializable `triggerKey` including event UUID and listener/ability identity, checked in the collector, trigger queue and stack **before** usage is reserved. Independent delayed registrations include their registration IDs. This is pending-event deduplication, not an unlimited replay ledger after a trigger resolves. Synthetic events without event UUIDs cannot receive delivery deduplication.

The coordinator stores no per-card subscriptions or executable callbacks in room state. Conservative cached metadata from immutable definitions chooses candidate watcher zones; actual effective abilities remain authoritative. A match with no explicit listener declarations avoids additional effective off-board discovery. Watcher characteristic queries share one short-lived evaluation cache.

## Compatibility, visibility and boundaries

Existing abilities without `trigger.listener` keep their old event-specific discovery and default filters. They do not silently become hand/library/graveyard watchers. `onEnterEffects` stays the ordinary ordered entry shorthand. Independent delayed registrations continue to own their retained source and lifetime; an explicit discovery listener inside `triggers / delay` is rejected rather than accepted and ignored.

Listening never moves a card or changes base visibility/observation audiences. Hidden cards are available to authoritative rules without making the rest of a zone public. Trigger presence follows existing stack presentation; source identity still follows the existing visibility policy (for example an opponent cannot see a hand-source identity merely because it triggered). Listener declarations do not reveal a source. Authors must explicitly use the existing observation/reveal consumers when a card requires disclosure; concealing the existence of a trigger would require a separate policy.

This clears the source-discovery dependency for self-discard/self-mill, hand-zone life-loss watchers and retained revealed-card listeners. It does not implement the affected workbook cards or certify their complete recipes. Tap/draw-step events, selected-result value accessors, event-subject targeting, healing modifiers and wording decisions remain separate dependencies.

## Verification

The 42 tests in `tests/engine/trigger-listeners.test.ts` cover strict parsing, both mill windows, retained identities/conditions, JSON recovery, hand/graveyard/library/exile watchers, token death without occupancy, granted abilities and trigger ordering, shared-per-event behavior, usage reservation, reveal-then-mill retention, delayed-registration separation and pending-delivery deduplication. Existing trigger, source, reveal/window and token tests provide regression coverage. No long socket test or full suite is required for this delivery.

Delivery validation: 218 distinct focused checks passed across the selected 14 test files (the 216-check regression run plus two final visibility cases), and the workspace typecheck passed. Tracked engine source meets the existing readability budgets: 209 long-line findings (budget 221), 41 nested ternaries, zero else-after-return findings and 20 undocumented exports. The unmodified whole-directory readability test also scans the local untracked backup copies and still fails; no backup files or gate budgets were changed. The previous full-suite failures remain outside this delivery's verification scope.
