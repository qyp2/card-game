import type { CardInstance } from '../types/card.types';

/** UUID locates a physical card; zone plus revision identifies one rules object. */
export function sameCardObject(a: CardInstance, b: CardInstance): boolean {
  return (
    a.uuid === b.uuid && a.state.zone === b.state.zone && (a.state.zoneRevision ?? 0) === (b.state.zoneRevision ?? 0)
  );
}

/** Stable identity for deduplication, including cards retained outside live zones. */
export function cardObjectKey(card: CardInstance): string {
  return JSON.stringify([card.uuid, card.state.zone, card.state.zoneRevision ?? 0]);
}
