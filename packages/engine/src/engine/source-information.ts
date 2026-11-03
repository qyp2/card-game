import type { CardInstance, CardSnapshot } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';
import type { StackObject } from '../types/effect.types';
import { CardCharacteristicService } from './card-characteristic-service';

/** Snapshot a card's characteristics at the moment it becomes a source. */
export function captureSourceInformation(room: GameRoom, card: CardInstance): CardSnapshot {
  const value = CardCharacteristicService.resolve(room, card);

  return {
    card: {
      ...structuredClone(card),
      state: { ...structuredClone(card.state), controllerId: value.controllerId },
      lastKnownCharacteristics: value,
      lastKnownCopiableCharacteristics: CardCharacteristicService.resolve(room, card, 1),
    },
    power: value.power,
    toughness: value.toughness,
  };
}

/** Attach a departure snapshot when the object still refers to the same incarnation. */
export function retainDepartingSource(object: StackObject, snapshot: CardSnapshot): StackObject {
  const source = object.source;

  // Spells carry their own source; only permanents need a departure snapshot,
  // and only while the object still matches the snapshot's incarnation.
  return object.type !== 'spell' &&
    source.uuid === snapshot.card.uuid &&
    source.state.zone === snapshot.card.state.zone &&
    (source.state.zoneRevision ?? 0) === (snapshot.card.state.zoneRevision ?? 0)
    ? { ...object, sourceInfo: snapshot }
    : object;
}

/** Persistent UUIDs locate cards; zone/revision locate the original rules object. */
export function resolveSourceInformation(room: GameRoom, object: StackObject): CardSnapshot {
  const expected = object.source;

  // Prefer the live card, but only if it is still the same incarnation.
  const live = [
    ...room.battlefield,
    ...room.stack.filter((item) => item.type === 'spell').map((item) => item.source),
    ...Object.values(room.players).flatMap((player) => [...player.hand, ...player.graveyard, ...player.deck, ...player.exile ?? []]),
  ].find((card) =>
    card.uuid === expected.uuid &&
    card.state.zone === expected.state.zone &&
    (card.state.zoneRevision ?? 0) === (expected.state.zoneRevision ?? 0));

  if (live) return captureSourceInformation(room, live);

  // The card is gone: fall back to the most recent snapshot we still hold.
  const current = room.stack.find((item) => item.uuid === object.uuid);

  // A triggered ability that fired on a permanent leaving may carry the
  // departure snapshot in its triggering event.
  const departure = object.type === 'triggered' &&
    ['PERMANENT_LEFT', 'PERMANENT_DIED', 'PERMANENT_DESTROYED'].includes(object.triggeringEvent?.eventId ?? '')
    ? object.triggeringEvent?.payload.snapshot as CardSnapshot | undefined
    : undefined;

  return current?.sourceInfo ??
    object.sourceInfo ??
    (departure?.card.uuid === expected.uuid ? departure : undefined) ??
    captureSourceInformation(room, expected);
}
