import type { CardInstance, TriggerFilter } from '../types/card.types';
import type { GameEvent } from '../types/game-event.types';
import type { GameRoom } from '../types/game.room.types';
import { CardCharacteristicService } from './card-characteristic-service';

/** Card events default to this object; player/step events default to its controller. */
export function triggerMatches(event: GameEvent, source: CardInstance, filter: TriggerFilter = {}, controllerId = source.state.controllerId, room?: GameRoom): boolean {
  const card = event.payload.card as CardInstance | undefined;

  // Events that describe something happening *to* a player rather than to a
  // card; these default to "any" subject instead of "self".
  const personalEvent = [
    'CARD_DRAWN',
    'CARD_DISCARDED_FROM_HAND',
    'CARD_DISCARDED_FROM_LIBRARY',
    'SPELL_CAST',
  ].includes(event.eventId);

  const subject = filter.subject ?? ((card && !personalEvent) || event.eventId === 'DAMAGE_DEALT' ? 'self' : 'any');

  // Identity is UUID *plus* zone and revision: a card that left and returned is
  // a different rules object.
  const sameObject = !!card && card.uuid === source.uuid && card.state.zone === source.state.zone &&
    (card.state.zoneRevision ?? 0) === (source.state.zoneRevision ?? 0);

  // Guard: subject filter.
  if (subject === 'self' && !sameObject) return false;
  if (subject === 'another' && (!card || sameObject)) return false;

  // Guard: controller filter. "self" means the trigger's controller, "opponent"
  // means anyone else.
  const controller = filter.controller ?? (card && !personalEvent ? 'any' : 'self');
  const player = event.payload.controllerId ?? event.payload.playerId ?? event.payload.currentPlayer;
  if (
    controller !== 'any' &&
    (typeof player !== 'string' || (controller === 'self' ? player !== controllerId : player === controllerId))
  ) {
    return false;
  }

  // Guard: card type filter, resolved through continuous effects when possible.
  if (
    filter.cardTypes?.length &&
    (!card || !filter.cardTypes.some((type) =>
      (room ? CardCharacteristicService.resolveTypes(room, card) : card.blueprint.cardTypes).includes(type)))
  ) {
    return false;
  }

  // Guard: subtype filter, resolved the same way.
  if (
    filter.subTypes?.length &&
    (!card || !filter.subTypes.some((type) =>
      (room ? CardCharacteristicService.resolveSubTypes(room, card) : card.blueprint.subTypes ?? []).includes(type)))
  ) {
    return false;
  }

  return true;
}
