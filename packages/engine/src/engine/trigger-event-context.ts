import type { CardInstance, CardSnapshot } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';
import type { TriggeringEvent, TriggerSubject } from '../types/effect.types';
import type { GameEvent } from './event-bus';
import { roomCards } from './continuous-effect-state';
import { captureSourceInformation } from './source-information';
import { sameCardObject } from '../shared/card-identity';
import { TRIGGER_EVENTS } from './trigger-events';

/** Room windows are ephemeral evaluation inputs, never stored in trigger state. */
export interface TriggerRooms {
  room?: GameRoom;
  before?: GameRoom;
  after?: GameRoom;
}
/** One event context is shared by card listeners, shorthand entry effects and delayed registrations. */
export interface TriggerEventContext {
  event: TriggeringEvent;
  snapshots: { before?: CardSnapshot; after?: CardSnapshot };
  watcherRoom?: GameRoom;
  conditionRoom?: GameRoom;
}

/** Retain effective characteristics with a room; small synthetic event fixtures can supply printed data. */
function snapshot(room: GameRoom | undefined, card: CardInstance): CardSnapshot {
  return room
    ? captureSourceInformation(room, card)
    : {
        card: structuredClone(card),
        power: card.lastKnownCharacteristics?.power ?? card.blueprint.power ?? 0,
        toughness: card.lastKnownCharacteristics?.toughness ?? card.blueprint.toughness ?? 0,
      };
}
/** Persist subject identity without retaining the before/after rooms. */
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
function eventCardSnapshots(event: GameEvent, rooms: TriggerRooms): { before?: CardSnapshot; after?: CardSnapshot } {
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
  const transition = TRIGGER_EVENTS[event.eventId]?.subject;
  const revision = card.state.zoneRevision ?? 0;
  // The payload anchors one side of a move. Only the adjacent revision can be
  // its counterpart; a later departure/return with the same UUID is unrelated.
  const previous = beforeCards.find((c) =>
    transition === 'arrival'
      ? c.uuid === card.uuid && (c.state.zoneRevision ?? 0) === revision - 1
      : sameCardObject(c, card),
  );
  const next = afterList.find((c) =>
    transition === 'departure'
      ? c.uuid === card.uuid && (c.state.zoneRevision ?? 0) === revision + 1
      : sameCardObject(c, card),
  );
  let before = retained;
  if (!before && previous) before = snapshot(rooms.before, previous);
  if (!before && transition !== 'arrival' && !rooms.before) before = snapshot(rooms.room, card);
  let after: CardSnapshot | undefined;
  if (next) after = snapshot(afterCards, next);
  if (!after && transition === 'arrival' && !afterCards) after = snapshot(undefined, card);
  return { before, after };
}

/** Freeze subject identity once; select discovery windows independently from after-event predicates. */
export function createTriggerEventContext(event: GameEvent, rooms: TriggerRooms): TriggerEventContext {
  const snapshots = eventCardSnapshots(event, rooms);
  const definition = TRIGGER_EVENTS[event.eventId];
  return {
    snapshots,
    watcherRoom: definition?.watcherState === 'before' ? (rooms.before ?? rooms.room) : (rooms.after ?? rooms.room),
    conditionRoom: rooms.after ?? rooms.room,
    event: {
      cause: event.cause,
      eventId: event.eventId,
      payload: event.payload,
      eventUuid: event.eventUuid,
      batchId: event.batchId,
      commandId: event.commandId,
      subject: { before: reference(snapshots.before), after: reference(snapshots.after) },
    },
  };
}
