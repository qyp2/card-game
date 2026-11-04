import type { CardInstance, CardZone, CardVisibility } from '../types/card.types';

/** Ordinary zone defaults. Face-down public-zone cards require a separate supported mechanic. */
export function defaultCardVisibility(zone: CardZone): CardVisibility {
  if (zone === 'library') return 'hidden';
  if (zone === 'hand') return 'owner';
  return 'public';
}
/** A stored base state belongs to its zone; stale imported states use the current zone's default. */
export function baseCardVisibility(card: CardInstance): CardVisibility {
  if (card.state.visibilityZone !== card.state.zone || card.state.visibility === undefined) {
    return defaultCardVisibility(card.state.zone);
  }
  return card.state.visibility;
}
/** Normal card access, independent of temporary observations and choice authority. */
export function baseCardVisibleTo(card: CardInstance, playerId: string): boolean {
  const visibility = baseCardVisibility(card);
  return visibility === 'public' || (visibility === 'owner' && card.state.ownerId === playerId);
}
