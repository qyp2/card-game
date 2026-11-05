import type { CardInstance, CardSnapshot, CardZone, TriggeredAbility, TriggerEvent } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';
import type { TriggeringEvent, TriggerSubject } from '../types/effect.types';
import type { GameEvent } from './event-bus';
import { roomCards } from './continuous-effect-state';
import { CardCharacteristicService, withCharacteristicCache } from './card-characteristic-service';
import { captureSourceInformation } from './source-information';

export interface ListenerCandidate {
  sourceInfo: CardSnapshot;
  ability: TriggeredAbility;
  room?: GameRoom;
  subject: NonNullable<TriggeringEvent['subject']>;
}
export interface ListenerRooms {
  room?: GameRoom;
  before?: GameRoom;
  after?: GameRoom;
}
const arrivals = new Set(['PERMANENT_ENTERED', 'CARD_DRAWN', 'SPELL_CAST']);
const departures = new Set([
  'PERMANENT_LEFT',
  'PERMANENT_DIED',
  'PERMANENT_DESTROYED',
  'CREATURE_KILLED',
  'CARD_DISCARDED_FROM_HAND',
  'CARD_DISCARDED_FROM_LIBRARY',
]);
function sameObject(a: CardInstance, b: CardInstance): boolean {
  return (
    a.uuid === b.uuid && a.state.zone === b.state.zone && (a.state.zoneRevision ?? 0) === (b.state.zoneRevision ?? 0)
  );
}
function snapshot(room: GameRoom | undefined, card: CardInstance): CardSnapshot {
  return room
    ? captureSourceInformation(room, card)
    : {
        card: structuredClone(card),
        power: card.lastKnownCharacteristics?.power ?? card.blueprint.power ?? 0,
        toughness: card.lastKnownCharacteristics?.toughness ?? card.blueprint.toughness ?? 0,
      };
}
function reference(info?: CardSnapshot): TriggerSubject | undefined {
  if (!info) return undefined;
  const { card } = info;
  return {
    cardUuid: card.uuid,
    zone: card.state.zone,
    zoneRevision: card.state.zoneRevision ?? 0,
    ownerId: card.state.ownerId,
    controllerId: card.state.controllerId,
  };
}

/** Select real event windows, never a later incarnation merely sharing the UUID. */
export function eventCardSnapshots(
  event: GameEvent,
  rooms: ListenerRooms,
): { before?: CardSnapshot; after?: CardSnapshot } {
  if (event.eventId === 'CARD_REVEALED') {
    const retained = event.payload.revealedSnapshot as CardSnapshot | undefined;
    const card = event.payload.revealedCard as CardInstance | undefined;
    const info = retained ?? (card ? snapshot(rooms.before ?? rooms.room, card) : undefined);
    return { before: info, after: info };
  }
  const card = event.payload.card as CardInstance | undefined;
  if (!card) return {};
  const retained = event.payload.snapshot as CardSnapshot | undefined;
  const beforeCards = rooms.before ? roomCards(rooms.before) : [];
  const afterCards = rooms.after ?? rooms.room;
  const afterList = afterCards ? roomCards(afterCards) : [];
  const moving = arrivals.has(event.eventId) || departures.has(event.eventId);
  const previous = beforeCards.find((c) => c.uuid === card.uuid && (moving || sameObject(c, card)));
  const next = afterList.find((c) => c.uuid === card.uuid && (moving || sameObject(c, card)));
  let before = retained;
  if (!before && previous) before = snapshot(rooms.before, previous);
  if (!before && !arrivals.has(event.eventId) && !rooms.before) before = snapshot(rooms.room, card);
  let after: CardSnapshot | undefined;
  if (next) after = snapshot(afterCards, next);
  if (!after && arrivals.has(event.eventId) && !afterCards) after = snapshot(undefined, card);
  return { before, after };
}

interface ListenerHints {
  zones: Set<CardZone>;
  eventCard: boolean;
}
// Cache immutable definition metadata only; no room instances or subscriptions.
const definitionHints = new WeakMap<object, ListenerHints>();
function listenerHints(value: unknown): ListenerHints {
  const hints: ListenerHints = { zones: new Set(), eventCard: false };
  if (!value || typeof value !== 'object') return hints;
  const cached = definitionHints.get(value);
  if (cached) return cached;
  const record = value as Record<string, unknown>;
  hints.eventCard = record.kind === 'event_card';
  if (record.kind === 'watcher' && Array.isArray(record.activeZones))
    for (const zone of record.activeZones) hints.zones.add(zone as CardZone);
  // Text effects can change authored zone words before discovery. Conservative
  // hints only select candidates; effective abilities still decide eligibility.
  if (record.type === 'TEXT') {
    hints.eventCard = true;
    for (const zone of ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack'] as const)
      hints.zones.add(zone);
  }
  for (const child of Object.values(record)) {
    const nested = listenerHints(child);
    hints.eventCard ||= nested.eventCard;
    for (const zone of nested.zones) hints.zones.add(zone);
  }
  definitionHints.set(value, hints);
  return hints;
}
function discoveryHints(event: GameEvent, rooms: ListenerRooms): ListenerHints {
  const definitions = new Set<object>();
  for (const room of new Set([rooms.room, rooms.before, rooms.after])) {
    if (!room) continue;
    for (const card of roomCards(room)) definitions.add(card.blueprint);
    for (const entry of room.continuousEffectPool) definitions.add(entry);
  }
  const card = event.payload.card as CardInstance | undefined;
  if (card) definitions.add(card.blueprint);
  for (const key of ['snapshot', 'revealedSnapshot'] as const) {
    const info = event.payload[key] as CardSnapshot | undefined;
    if (info) definitions.add(info.card);
  }
  const hints: ListenerHints = { zones: new Set(), eventCard: false };
  for (const definition of definitions) {
    const nested = listenerHints(definition);
    hints.eventCard ||= nested.eventCard;
    for (const zone of nested.zones) hints.zones.add(zone);
  }
  return hints;
}

/** Explicit listeners only. Implicit authored abilities retain their original scan. */
export function explicitListenerCandidates(
  event: GameEvent,
  triggerEvent: TriggerEvent,
  rooms: ListenerRooms,
): ListenerCandidate[] {
  const candidates: ListenerCandidate[] = [];
  const hints = discoveryHints(event, rooms);
  if (!hints.eventCard && !hints.zones.size) return candidates;
  const states = eventCardSnapshots(event, rooms);
  const subject = { before: reference(states.before), after: reference(states.after) };
  for (const state of hints.eventCard ? (['before', 'after'] as const) : []) {
    const sourceInfo = states[state];
    if (!sourceInfo) continue;
    const abilities = sourceInfo.card.lastKnownCharacteristics?.abilities ?? sourceInfo.card.blueprint.abilities;
    for (const ability of abilities) {
      if (ability.type !== 'triggered' || ability.triggerCondition !== triggerEvent) continue;
      const listener = ability.trigger?.listener;
      if (
        listener?.kind !== 'event_card' ||
        listener.state !== state ||
        !listener.zones.includes(sourceInfo.card.state.zone)
      )
        continue;
      candidates.push({ sourceInfo, ability, room: rooms[state] ?? rooms.room, subject });
    }
  }
  const room = rooms.room;
  if (room && hints.zones.size)
    withCharacteristicCache(room, () => {
      const cards = roomCards(room);
      for (const card of cards) {
        if (!hints.zones.has(card.state.zone)) continue;
        const abilities = CardCharacteristicService.resolveAbilities(room, card);
        for (const ability of abilities) {
          if (ability.type !== 'triggered' || ability.triggerCondition !== triggerEvent) continue;
          const listener = ability.trigger?.listener;
          if (listener?.kind !== 'watcher' || !listener.activeZones.includes(card.state.zone)) continue;
          candidates.push({ sourceInfo: snapshot(room, card), ability, room, subject });
        }
      }
    });
  return candidates;
}
