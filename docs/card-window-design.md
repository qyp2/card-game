# Captured card windows and configurable visibility

Status: **design, not yet implemented**. This supplements [resolution-local card collections](resolution-results-architecture.md) and the [current blocker ledger](card-blockers-current.md). Examples below propose additions to the authored contract; the current parser does not accept them yet.

## The shared model

Yes: a reveal/look window is much like a mill result whose cards have not moved. Share the retained collection and query machinery; keep capture, physical movement, player decisions and information exposure separate.

| Operation | Where the real cards are | What the collection records |
|---|---|---|
| Mill | The actual destination immediately after replacement processing | Successful arrival snapshots, plus attempted-move provenance |
| Capture/look/reveal | Their existing zone, normally the library | Exact captured incarnations and observation snapshots |
| Later selection/movement | Existing movement pipeline changes the real zone | The original collection retains its historical membership; moved cards stop matching its current source-zone references |

Neither collection owns live cards or creates another physical zone. A revealed library card is still in the library. Capture does not itself discard, draw, exile or put anything into a hand. Visibility does not change ownership, control, movement destinations or selection rights.

Reuse `StackObject.resolutionResults`, its continuation ownership and the existing `from: { kind: "result", name: "window" }` query source. Generalize the result kind to include captured observations while retaining `milled` as useful provenance. Do not create a second reveal-only query engine or rename working mill behavior merely for consistency.

## An editable authored contract

Proposed private look at the top six cards of your library:

```json
{
  "family": "cards",
  "operation": "capture_window",
  "params": {
    "zone": "library",
    "zonePlayer": "self",
    "position": "top",
    "amount": 6,
    "visibility": {
      "faces": ["controller"],
      "count": ["all_players"],
      "order": ["controller"],
      "expires": "resolution_end"
    },
    "event": "none"
  },
  "recordResult": { "name": "window", "kind": "captured" }
}
```

To publicly reveal those six instead, use `all_players` for faces/count/order and `event: "revealed"`. Public revelation and private looking share capture mechanics but have different information and trigger semantics.

These are strict data fields, not executable callbacks. The first implementation should support bounded top-library capture for self/opponent, using the same card-source collection layer. Additional origins or window-selection recipes can extend that boundary later; unimplemented combinations must fail validation. The amount limit should be a documented work bound supporting the included five-, six- and eight-card recipes, rather than the old starter-card bound of three.

Existing authored `cards / reveal_top` recipes remain supported. Lower them into the shared public capture/selection/remainder path, preserving their printed behavior and reveal events. Keep the top/bottom remainder recipe as a convenience; do not make it the behavior of every capture.

## Visibility is an explicit policy

| Field | Meaning |
|---|---|
| `faces` | Who may see card names and faces in this captured observation |
| `count` | Who may see how many cards were captured |
| `order` | Who may see their captured source order, such as top-to-bottom |
| `expires` | When this temporary observation grant stops being active |

Audience entries are a closed vocabulary: `controller`, `opponent`, `zone_owner`, `all_players`; an empty list grants nobody that information. `controller` means the resolving object's controller, not the owner of the looked-at library. Resolve roles to concrete room players when the observation is created so later control changes cannot reassign historical information. `zone_owner` needs an unambiguous player-owned source; otherwise reject the combination.

Validate policy relationships. Seeing every face necessarily reveals the set's size, so every face audience must also receive count visibility. Order visibility requires face visibility. Reject contradictory policies rather than letting array shape accidentally override them. Hidden order must use a display order unrelated to source position, without exposing source indices. Captured order is an observation at capture time, not a claim about the current library after a later reorder or shuffle.

Safe defaults for generic capture grant no additional information and emit no reveal event. The normal game-zone visibility still applies: this policy can expose an otherwise hidden library observation, but cannot turn public graveyard/battlefield cards face down. Face-down cards or concealed public-zone identities require their own actual game mechanic.

Visibility must be enforced by server projection, using one shared audience resolver for views, events and history. Hiding a React component is insufficient. An unauthorized player receives no names, definitions, UUIDs, source positions or raw result maps. If count is allowed, send a count; if it is not allowed, omit that information rather than sending zero or an array of placeholders. A deliberately supported blind choice can receive opaque option handles, without gaining card identities.

The admin Test Lab's authenticated inspection policy stays separate. Being an admin in a normal player seat must not automatically widen that seat's information rights.

## Updating visibility without changing membership

A later instruction may change exposure for a captured set or filtered subset. Proposed example: after privately looking, reveal only its creatures:

```json
{
  "family": "cards",
  "operation": "set_collection_visibility",
  "params": {
    "from": { "kind": "result", "name": "window" },
    "filter": { "cardTypes": ["Creature"] },
    "visibility": {
      "faces": ["all_players"],
      "count": ["all_players"],
      "order": [],
      "expires": "resolution_end"
    },
    "event": "revealed"
  }
}
```

The subset uses the same shared card filter, materialized into exact member references at this instruction. It does not become a continuously changing library filter. Authorize any emitted reveal event against the effective exposed audience; public `revealed` requires public faces. Merely changing visibility does not create a reveal event unless the instruction explicitly requests it. A private look never silently fires `ON_REVEAL`.

An exposure update replaces that observation's grant on the selected members; ordinary zone visibility and independent valid grants still apply. Reducing exposure stops publishing active information, but cannot make a person forget already seen cards or erase their legitimate history. The grant applies to the captured observation, not a tracking right into the card's later hidden zones. When a member moves, its new incarnation follows normal destination visibility; the old observation may remain in authorized history.

Keep the visibility record separate from collection membership. Showing or hiding a card must not remove it from a rule query, change a count used by the engine, or change who chooses. Persistent visibility after resolution would require a separately owned room effect with explicit lifetime; do not retain a completed stack object's temporary collection forever.

## Selection and disposition remain ordinary instructions

After capture, reuse the existing search/filter pattern:

```json
{
  "family": "cards",
  "operation": "move",
  "params": { "origin": "library", "destination": "hand" },
  "choice": {
    "kind": "search",
    "zone": "library",
    "from": { "kind": "result", "name": "window" },
    "cardTypes": ["Creature"],
    "subTypes": ["蒼巨人"],
    "min": 0,
    "max": 1
  }
}
```

A second instruction can select an artifact from the same window; the first selected card has left the library and is no longer in that window's current actionable members. A final instruction moves or orders all remaining current members. No follow-up may fall back to the whole library if the named set is missing.

A chooser's permission and visibility are distinct. Seeing a public window does not let the opponent answer its controller's choice. Conversely, creating a choice must not itself reveal identities that its policy denies; require suitable face access or an explicitly supported blind-selection mode. Opponents can see public revealed cards while still seeing the ordinary waiting view for another player's pending decision. Unsubmitted selections stay private.

Use shared filters, `current`/`recorded` queries, explicit optional/mandatory bounds and ordinary movement/replacement handling. Take-all, distinct-name selections and repeated capture are separate validated recipe options, not ad hoc card handlers. Repetition must allocate distinct occurrence identities or explicitly replace a consumed window; duplicate names must not silently merge unrelated captures.

## Current versus recorded observations

For captured windows, the collection anchor is the observation in its original zone and revision. For mill, it is the successful actual arrival. Normalize these anchors behind the shared collector without disguising an unmoved observation as a physical zone arrival.

- `current` locates the exact anchored incarnation and evaluates live characteristics. A selected card leaving that zone, or leaving and returning, stops matching. Other cards in the zone are never added.
- `recorded` uses the immutable anchor snapshot. It can count the original revealed yellow cards after some have moved, for example, without changing the historical result.
- Movement that needs its own later result should capture a new named result at its actual outcome; do not make an original window automatically follow every future incarnation.

Capture does not have cancelled-movement semantics because it does not move anything. Mill retains its existing pre-replacement probe and successful-arrival rules, including redirects and cancelled attempts. Capture and mill can share collection consumers without forcing their production steps to be identical.

## Projection, logs and lifecycle

The current mill result maps are deliberately server-only. The current starter reveal path retains `resolutionReveals` and emits `CARD_REVEALED` on completion; it does not yet supply the configurable live window view proposed here. The existing chooser-only choice view is also insufficient for showing a public window to both players while one chooses.

Implement a projected active-observation view that reads the resolving stack/continuation and applies the policy. Keep raw result snapshots internal. Capture-time visibility must become available when the window is opened, not only after resolution, and reconnect must reconstruct the same authorized view. Reveal events need a single stable occurrence identity so replay does not fire twice; preserve existing starter trigger ordering until its migration is explicitly tested and documented.

Public and private history must be projected per recipient. In particular, do not feed a private-look name into the current public `CARD_REVEALED` notification path. Authorized history may keep the observed snapshot after the active window closes, which supports browser refresh without granting current hand/library access. A later opponent reconnect must not receive another player's private observations through a shared log, delta or completion report.

The collection and temporary grants survive payment, search and replacement pauses as serializable continuation data. They expire with the whole resolving object on completion, countering or fizzling. A cancelled optional reveal creates no observation or event. Earlier committed movement stays committed; collection cleanup never moves the cards again.

## Delivery and acceptance

1. Generalize capture anchors behind the existing result-source query API, retaining mill semantics and strict parser ownership.
2. Add capture plus validated visibility/exposure updates, central audience resolution and projected active observations/history.
3. Lower starter reveal recipes into this path and prove event/replay compatibility.
4. Add explicit selection/remainder recipes, then implement complete workbook cards whose remaining dependencies are settled.

Focused logic tests should cover private look, public reveal, opponent-library roles, hidden count/order, partial exposure, chooser authority, no accidental reveal trigger, immutable historical counts, exact remainder membership, movement/reentry, JSON reconstruction, reconnect/deltas, cleanup and log redaction. Existing mill/reveal/card-query/projection tests remain regression checks. No long socket test or full suite is needed for this design slice.

This is an implementation design, not a completed engine unblocker or a change to card coverage. It addresses the retained-window foundation of the thirteen reveal rows; distinct-name rules, repetition, cross-owner destinations and other card-specific dependencies remain explicit work.
