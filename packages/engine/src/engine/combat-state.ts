import { CardCharacteristicService } from './card-characteristic-service';
import type { CardInstance } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';

/** A declaration snapshot identifies the original battlefield object, not just a UUID. */
export function liveCombatCard(room: GameRoom, snapshot: CardInstance): CardInstance | undefined {
  return room.battlefield.find((card) =>
    card.uuid === snapshot.uuid &&
    card.state.zone === 'battlefield' &&
    (card.state.zoneRevision ?? 0) === (snapshot.state.zoneRevision ?? 0) &&
    CardCharacteristicService.resolveController(room, card) === snapshot.state.controllerId &&
    CardCharacteristicService.resolveTypes(room, card).includes('Creature'));
}

/** Prune permanently; keep declaration snapshots and blocked status for debugging. */
export function reconcileCombat(room: GameRoom): GameRoom {
  let changed = false;

  const combat = room.combat.flatMap((declaration) => {
    // An attacker that left the battlefield drops the whole declaration.
    if (!liveCombatCard(room, declaration.attacker)) {
      changed = true;
      return [];
    }

    // Blockers are pruned individually; the declaration survives without them.
    const blockers = declaration.blockers.filter((card) => !!liveCombatCard(room, card));
    const blocked = declaration.blocked ?? declaration.blockers.length > 0;

    // Nothing changed for this declaration — keep the original object identity.
    if (blockers.length === declaration.blockers.length && declaration.blocked === blocked) {
      return [declaration];
    }

    changed = true;
    return [{ ...declaration, blockers, blocked }];
  });

  // Preserve the room object when nothing was pruned, so callers can cheaply
  // detect a no-op reconciliation.
  return changed ? { ...room, combat } : room;
}
