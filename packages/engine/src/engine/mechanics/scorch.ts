import type { CardInstance } from '../../types/card.types';
import type { CardCharacteristics } from '../../types/continuous-effect.types';
import type { GameRoom } from '../../types/game.room.types';
import type { GameMutation } from '../../types/game-mutation.types';

/** Current starter ruling: attack + maximum health, independent of marked damage. */
export function planScorchDestruction(room: GameRoom, card: CardInstance, value: CardCharacteristics): GameMutation | undefined {
  // Guard: scorch must be enabled, the card must be a creature, it must carry at
  // least one scorch counter, and indestructible creatures are exempt.
  if (
    !room.setup?.scorch ||
    !value.cardTypes.includes('Creature') ||
    !(card.state.counters.scorch > 0) ||
    value.keywords.some((keyword) => keyword.toLowerCase() === 'indestructible')
  ) {
    return;
  }

  // Relic thresholds remain a separate unresolved rule. Never guess from cost or
  // ability count.
  if (card.state.counters.scorch >= value.power + value.toughness) {
    return {
      type: 'DESTROY_CARD',
      cardUuid: card.uuid,
      zoneRevision: card.state.zoneRevision ?? 0,
    };
  }
}
