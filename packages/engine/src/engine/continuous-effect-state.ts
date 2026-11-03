import type { CardInstance } from '../types/card.types';
import type { ContinuousEffectEntry } from '../types/continuous-effect.types';
import type { GameRoom } from '../types/game.room.types';
import { collectCards } from '../shared/card-query';

/** Every card instance in the room, de-duplicated by UUID. */
export function roomCards(room: GameRoom): CardInstance[] {
  return collectCards(room);
}

/** Resolve the card an effect came from, honouring its revision and required zone. */
export function effectSource(cards: CardInstance[], entry: ContinuousEffectEntry): CardInstance | undefined {
  return cards.find((c) =>
    c.uuid === entry.source &&
    (entry.sourceRevision === undefined || (c.state.zoneRevision ?? 0) === entry.sourceRevision) &&
    (entry.requiredZone == null || c.state.zone === entry.requiredZone));
}

/** True when the effect's source still satisfies the effect's duration and zone. */
export function effectIsActive(cards: CardInstance[], entry: ContinuousEffectEntry): boolean {
  // Durations tied to the source's presence need the source on the battlefield.
  const sourceDuration = entry.duration === 'WHILE_ON_BATTLEFIELD' || entry.duration === 'WHILE_ATTACHED';
  if (sourceDuration) {
    const source = effectSource(cards, { ...entry, requiredZone: 'battlefield' });

    // WHILE_ATTACHED additionally requires the source to still be attached.
    return !!source && (entry.duration !== 'WHILE_ATTACHED' || !!source.state.attachedTo);
  }

  // Zone-independent effects are always active.
  if (
    entry.requiredZone === null ||
    (entry.origin === 'resolved' && entry.requiredZone === undefined) ||
    entry.source === 'global' ||
    entry.source === 'emblem'
  ) {
    return true;
  }

  // Otherwise the source must still exist in the required zone (battlefield by
  // default).
  const source = effectSource(cards, { ...entry, requiredZone: entry.requiredZone ?? 'battlefield' });
  if (!source) return false;

  return true;
}
