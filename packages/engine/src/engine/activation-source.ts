import type { GameRoom, PlayerId } from '../types/game.room.types';
import { CardCharacteristicService } from './card-characteristic-service';

/** The two supported activation zones; each ability still declares its permission. */
export function findActivationSource(room: GameRoom, playerId: PlayerId, uuid: string | undefined) {
  // Guard: without a card id there is nothing to look up.
  if (!uuid) return;

  // Battlefield first — the card must also be controlled by the activating
  // player. Falls back to the player's hand, where control is implied by
  // ownership.
  return (
    room.battlefield.find(
      (card) => card.uuid === uuid && CardCharacteristicService.resolveController(room, card) === playerId,
    ) ?? room.players[playerId]?.hand.find((card) => card.uuid === uuid)
  );
}
