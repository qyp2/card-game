import type { CardInstance, CardSnapshot } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';
import type { StackObject } from '../types/effect.types';
import { roomCards } from './continuous-effect-state';
import { sameCardObject } from '../shared/card-identity';
import { TRIGGER_EVENTS } from './trigger-events';
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
  return object.type !== 'spell' && sameCardObject(source, snapshot.card)
    ? { ...object, sourceInfo: snapshot }
    : object;
}

/** Persistent UUIDs locate cards; zone/revision locate the original rules object. */
export function resolveSourceInformation(room: GameRoom, object: StackObject): CardSnapshot {
  const expected = object.source;

  // Prefer the live card, but only if it is still the same incarnation.
  const live = roomCards(room).find((card) => sameCardObject(card, expected));

  if (live) return captureSourceInformation(room, live);

  // The card is gone: fall back to the most recent snapshot we still hold.
  const current = room.stack.find((item) => item.uuid === object.uuid);

  // A triggered ability that fired on a permanent leaving may carry the
  // departure snapshot in its triggering event.
  const departure =
    object.type === 'triggered' && TRIGGER_EVENTS[object.triggeringEvent?.eventId ?? '']?.watcherState === 'before'
      ? (object.triggeringEvent?.payload.snapshot as CardSnapshot | undefined)
      : undefined;

  return (
    current?.sourceInfo ??
    object.sourceInfo ??
    (departure && sameCardObject(departure.card, expected) ? departure : undefined) ??
    captureSourceInformation(room, expected)
  );
}
