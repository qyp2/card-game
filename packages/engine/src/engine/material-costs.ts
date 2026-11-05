import { CardCharacteristicService } from './card-characteristic-service';
import { fixedManaValue, matchesCardFilter } from '../shared/card-query';
import type { GameRoom } from '../types/game.room.types';
import type { GameMutation } from '../types/game-mutation.types';
import type { MaterialDestructionCost } from '../types/effect.types';

type MaterialOption = { id: string; label: string; weight: number; value: { cardUuid: string; zoneRevision: number } };

/** Eligible public battlefield objects and their effective mana values. */
export function materialPaymentOptions(room: GameRoom, playerId: string, cost: MaterialDestructionCost): MaterialOption[] {
  return room.battlefield.flatMap(card => {
    const value = CardCharacteristicService.resolve(room, card);
    if (
      value.controllerId !== playerId ||
      value.keywords.some(keyword => keyword.toLowerCase() === 'indestructible') ||
      !matchesCardFilter(card, value, cost.filter, playerId)
    ) return [];

    const manaValue = fixedManaValue(value);
    if (manaValue === undefined) return [];

    return [{
      id: card.uuid,
      label: `${value.name} (mana value ${manaValue})`,
      weight: manaValue,
      value: { cardUuid: card.uuid, zoneRevision: card.state.zoneRevision ?? 0 },
    }];
  });
}

/** Mana values are nonnegative, so the sum of all eligible cards bounds affordability. */
export function canAffordMaterials(room: GameRoom, playerId: string, cost: MaterialDestructionCost): boolean {
  return materialPaymentOptions(room, playerId, cost)
    .reduce((total, option) => total + option.weight, 0) > cost.manaValueGreaterThan;
}

/** Validate exact incarnations and propose one destruction per distinct material. */
export function planMaterialPayment(room: GameRoom, playerId: string, cost: MaterialDestructionCost, selected: unknown):
  { success: true; mutations: GameMutation[] } | { success: false; reason: string } {
  const reject = (reason: string) => ({ success: false as const, reason });
  if (!Array.isArray(selected) || !selected.length || selected.length > room.battlefield.length) {
    return reject('Choose one or more ritual materials');
  }

  const available = new Map(materialPaymentOptions(room, playerId, cost).map(option => [option.id, option]));
  const mutations: GameMutation[] = [];
  let total = 0;
  for (const entry of selected) {
    const option = available.get(entry?.cardUuid);
    if (!option || option.value.zoneRevision !== entry.zoneRevision) return reject('Invalid ritual material');
    available.delete(option.id);
    total += option.weight;
    mutations.push({ type: 'DESTROY_CARD', ...option.value, requiredPayment: true });
  }

  if (total <= cost.manaValueGreaterThan) return reject(`Material mana value must be greater than ${cost.manaValueGreaterThan}`);

  return { success: true, mutations };
}
