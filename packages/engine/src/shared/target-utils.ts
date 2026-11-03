import type { CardInstance } from '../types/card.types';
import type { TargetingDefinition } from '../types/effect.types';
import type { GameRoom } from '../types/game.room.types';
import { CardCharacteristicService } from '../engine/card-characteristic-service';
import { matchesCardFilter } from './card-query';

/**
 * Match shared structural filters, then apply battlefield-relative extrema.
 *
 * Shared by the server (ActionValidator.isTargetLegal) and the client
 * (TargetSelector) so filter rules stay in sync.
 *
 * @param card - The card on the battlefield to check.
 * @param def - The targeting definition with optional filter fields.
 * @param playerId - The ID of the player choosing targets (for controller filter).
 * @returns `true` if the card passes all applicable filters.
 */
export function matchesTargetFilter(
  card: CardInstance,
  def: TargetingDefinition,
  playerId: string,
  room?: GameRoom,
): boolean {
  const value = room ? CardCharacteristicService.resolve(room, card) : { ...card.blueprint, controllerId: card.state.controllerId };
  if (!matchesCardFilter(card, value, def, playerId)) return false;
  if (def.extrema) {
    if (!room || def.extrema.field !== 'remainingHealth' || def.extrema.order !== 'min' || card.state.zone !== 'battlefield') return false;
    const base = { ...def, extrema: undefined };
    const candidates = room.battlefield.filter(candidate => matchesTargetFilter(candidate, base, playerId, room));
    const remainingHealth = (candidate: CardInstance) => CardCharacteristicService.resolveToughness(room, candidate) - (candidate.state.damageTaken ?? 0);
    if (!candidates.length || remainingHealth(card) !== Math.min(...candidates.map(remainingHealth))) return false;
  }
  return true;
}
