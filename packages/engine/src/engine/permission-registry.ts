// Casting and targeting permission checks; value transformations use their own rule families.
import type { GameRoom, PlayerId } from '../types/game.room.types';
import type { CardInstance } from '../types/card.types';
import type { TargetPointer } from '../types/effect.types';
import { targetPermissionsAllow } from '../shared/target-legality';
import { actionPermission } from '../shared/action-permissions';

/**
 * Permission checks shared across announcement and resolution.
 * Target rules extend built-in keyword permissions; play restrictions use effective permission rules.
 */
export class PermissionRegistry {
  private static targetRules = new Set<(room: GameRoom, playerId: PlayerId, source: CardInstance, target: TargetPointer) => boolean>();

  /** Register an extra target restriction; the returned function unregisters it. */
  static registerTargetRule(rule: (room: GameRoom, playerId: PlayerId, source: CardInstance, target: TargetPointer) => boolean): () => void {
    this.targetRules.add(rule);

    return () => {
      this.targetRules.delete(rule);
    };
  }

  /**
   * Check effective casting permissions.
   */
  static canPlay(room: GameRoom, playerId: PlayerId, card: CardInstance): boolean {
    return actionPermission(room, playerId, card, 'cast').allowed;
  }

  /**
   * Check keyword permissions and registered restrictions against live state.
   */
  static canTarget(
    room: GameRoom,
    playerId: PlayerId,
    card: CardInstance,
    targets: TargetPointer[]
  ): boolean {
    // Every target must pass both the built-in keyword rules and every
    // registered restriction.
    return targets.every((target) =>
      targetPermissionsAllow(room, playerId, card, target) &&
      [...this.targetRules].every((rule) => rule(room, playerId, card, target)));
  }
}
