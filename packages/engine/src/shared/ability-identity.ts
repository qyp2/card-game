import type { CardInstance } from '../types/card.types';

/** Occurrence-history key. Preserve its spelling so saved rooms and rule paths remain readable. */
export const abilityUseKey = (source: CardInstance, id: string): string =>
  `${source.uuid}:${source.state.zoneRevision ?? 0}:${id}`;
