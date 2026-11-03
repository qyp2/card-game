// src/engine/handlers/declare-attackers-handler.ts
import type { ActionHandler, ActionData, ActionResult } from '../action-registry';
import type { GameMutation } from '../../types/game-mutation.types';
import type { GameRoom, PlayerId } from '../../types/game.room.types';
import type { CardInstance } from '../../types/card.types';
import type { CombatDeclaration } from '../../types/effect.types';
import { CardCharacteristicService } from '../card-characteristic-service';
import { CombatRuleRegistry } from '../combat-rules';
import { captureSourceInformation } from '../source-information';

/** Find a card the given player controls on the battlefield. */
function findCardOnBattlefield(room: GameRoom, playerId: PlayerId, cardUuid: string): CardInstance | undefined {
  return room.battlefield.find((c) =>
    c.uuid === cardUuid && CardCharacteristicService.resolveController(room, c) === playerId);
}

export const declareAttackersHandler: ActionHandler = {
  validate(room: GameRoom, playerId: PlayerId, action: ActionData): ActionResult {
    // Guard: combat is already declared, or responses are still pending.
    if (room.stack.length || room.combatDeclarations?.attackers) {
      return { success: false, phase: 'validate', reason: 'Combat declaration is already complete or responses are pending' };
    }

    const attackers = action.attackers as { cardUuid: string }[] | undefined;

    // Guard: the packet must name the attackers.
    if (!attackers) {
      return { success: false, phase: 'validate', reason: 'attackers is required' };
    }

    // Must be your turn
    if (room.activeTurnPlayerId !== playerId) {
      return { success: false, phase: 'validate', reason: 'Not your turn' };
    }

    // Must be in declareAttackersStep
    if (room.phase !== 'declareAttackersStep') {
      return { success: false, phase: 'validate', reason: 'Can only declare attackers during declare attackers step' };
    }

    // Check for duplicate cardUuids
    const uuids = attackers.map((a) => a.cardUuid);
    if (new Set(uuids).size !== uuids.length) {
      return { success: false, phase: 'validate', reason: 'Duplicate attackers are not allowed' };
    }

    for (const { cardUuid } of attackers) {
      const card = findCardOnBattlefield(room, playerId, cardUuid);

      // Guard: each attacker must be a creature you control on the battlefield.
      if (!card) {
        return { success: false, phase: 'validate', reason: `Creature ${cardUuid} not found on your battlefield` };
      }

      if (!CardCharacteristicService.resolveTypes(room, card).includes('Creature')) {
        return { success: false, phase: 'validate', reason: `Card ${cardUuid} is not a creature` };
      }

      // Guard: attacking taps the creature, so it must be untapped.
      if (card.state.isTapped) {
        return { success: false, phase: 'validate', reason: `${CardCharacteristicService.resolve(room, card).name} is already tapped` };
      }

      // Guard: summoning sickness, unless a combat rule grants haste.
      if (
        card.state.summoningSickness &&
        !CombatRuleRegistry.canAttackWhileSummoningSick({
          room,
          playerId,
          attackers: attackers.map(({ cardUuid }) => findCardOnBattlefield(room, playerId, cardUuid)!).filter(Boolean),
        }, card)
      ) {
        return { success: false, phase: 'validate', reason: `${CardCharacteristicService.resolve(room, card).name} has summoning sickness` };
      }

      // Guard: one attack per creature per turn.
      if (card.state.attackedThisTurn) {
        return { success: false, phase: 'validate', reason: `${CardCharacteristicService.resolve(room, card).name} has already attacked this turn` };
      }
    }

    const reason = CombatRuleRegistry.validateAttackers({
      room,
      playerId,
      attackers: attackers.map(({ cardUuid }) => findCardOnBattlefield(room, playerId, cardUuid)!),
    });

    return reason ? { success: false, phase: 'validate', reason } : { success: true };
  },

  propose(room: GameRoom, playerId: PlayerId, action: ActionData): ActionResult {
    const attackers = action.attackers as { cardUuid: string }[];
    const mutations: GameMutation[] = [];
    const declarations: CombatDeclaration[] = [];

    for (const { cardUuid } of attackers) {
      const card = findCardOnBattlefield(room, playerId, cardUuid);

      // Guard: the board may have changed since validation.
      if (!card) {
        return { success: false, phase: 'propose', reason: `Creature ${cardUuid} disappeared from battlefield` };
      }

      // Cost: tap and mark as attacked
      mutations.push({ type: 'TAP_CARD', cardUuid: card.uuid });
      mutations.push({ type: 'SET_ATTACKED_THIS_TURN', cardUuid: card.uuid, value: true });

      const attackerPower = CardCharacteristicService.resolvePower(room, card);

      declarations.push({
        uuid: card.uuid, // use card uuid as declaration uuid for blocker assignment lookup
        attacker: captureSourceInformation(room, card).card,
        attackerPower,
        blockers: [],
        blocked: false,
      });
    }

    // Batch declare all attackers at once
    const consequences = CombatRuleRegistry.attackerMutations({
      room,
      playerId,
      attackers: attackers.map(({ cardUuid }) => findCardOnBattlefield(room, playerId, cardUuid)!),
    }, mutations);
    consequences.push({ type: 'DECLARE_ATTACKERS', declarations });

    // No stackObject — turn-based action, damage applied later in combatDamageStep
    return { success: true, mutations: consequences };
  },
};
