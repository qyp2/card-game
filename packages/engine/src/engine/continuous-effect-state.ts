import type { CardInstance } from '../types/card.types';
import type { ContinuousEffectEntry } from '../types/continuous-effect.types';
import type { GameRoom } from '../types/game.room.types';
import { collectCards } from '../shared/card-query';

export function roomCards(room: GameRoom): CardInstance[] {
  return collectCards(room);
}

export function effectSource(cards: CardInstance[], entry: ContinuousEffectEntry): CardInstance | undefined {
  return cards.find(c => c.uuid === entry.source && (entry.sourceRevision === undefined || (c.state.zoneRevision ?? 0) === entry.sourceRevision) &&
    (entry.requiredZone == null || c.state.zone === entry.requiredZone));
}

export function effectIsActive(cards: CardInstance[], entry: ContinuousEffectEntry): boolean {
  const sourceDuration = entry.duration === 'WHILE_ON_BATTLEFIELD' || entry.duration === 'WHILE_ATTACHED';
  if (sourceDuration) {
    const source = effectSource(cards, { ...entry, requiredZone: 'battlefield' });
    return !!source && (entry.duration !== 'WHILE_ATTACHED' || !!source.state.attachedTo);
  }
  if (entry.requiredZone === null || (entry.origin === 'resolved' && entry.requiredZone === undefined) || entry.source === 'global' || entry.source === 'emblem') return true;
  const source = effectSource(cards, { ...entry, requiredZone: entry.requiredZone ?? 'battlefield' });
  if (!source) return false;
  return true;
}
