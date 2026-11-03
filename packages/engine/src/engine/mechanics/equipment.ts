import type { GameRoom } from '../../types/game.room.types';
import type { GameMutation } from '../../types/game-mutation.types';
import { CardCharacteristicService } from '../card-characteristic-service';
import { structuralTargetLegal, targetPermissionsAllow } from '../../shared/target-legality';

/** Both the resolving effect and reducer enforce exact battlefield incarnations. */
export function legalEquipmentAttachment(room: GameRoom, operation: Extract<GameMutation, { type: 'ATTACH_CARD' }>): boolean {
  // Both cards must still be the exact battlefield incarnations named by the
  // operation; a zone change invalidates the attachment.
  const source = room.battlefield.find(
    (card) => card.uuid === operation.cardUuid && (card.state.zoneRevision ?? 0) === operation.zoneRevision,
  );
  const host = room.battlefield.find(
    (card) => card.uuid === operation.hostUuid && (card.state.zoneRevision ?? 0) === operation.hostRevision,
  );

  // Guard: both must exist, and an equipment cannot attach to itself.
  if (!source || !host || source.uuid === host.uuid) return false;

  const value = CardCharacteristicService.resolve(room, source);

  // Guard: the source must be an Equipment controlled by the acting player.
  if (!value.subTypes.includes('Equipment') || value.controllerId !== operation.controllerId) return false;

  const target = {
    targetType: 'permanent' as const,
    cardUuid: host.uuid,
    zoneRevision: operation.hostRevision,
  };

  // The host must be a creature, satisfy any printed attachment requirements,
  // and be a legal target for the equipment.
  return CardCharacteristicService.resolveTypes(room, host).includes('Creature')
    && (!value.attachmentRequirements || structuralTargetLegal(room, operation.controllerId, target, value.attachmentRequirements))
    && targetPermissionsAllow(room, operation.controllerId, source, target);
}
