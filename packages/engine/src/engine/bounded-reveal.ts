import type { GameRoom } from '../types/game.room.types';
import type { StackObject, StackEffect, EffectDefinition } from '../types/effect.types';
import { buildStackEffects } from './resolution-planning';
import { resolveSourceInformation } from './source-information';
import { CardCharacteristicService } from './card-characteristic-service';
import type { CardFilter } from '../types/card-query.types';
import { validCardFilter } from '../shared/card-filter-validation';

/** Expand only the starter's bounded reveal instructions at the current cursor. */
export function expandBoundedReveal(room: GameRoom, stack: StackObject, effect: StackEffect, index: number): StackObject | undefined {
  const self = { type: 'self' as const, required: false };
  let definitions: EffectDefinition[];
  let reveals = stack.resolutionReveals;
  if (effect.action === 'REVEAL_TOP') {
    const count = effect.params.amount;
    if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 3) return { ...stack, effects: stack.effects.filter((_, i) => i !== index) };
    const cards = room.players[stack.controllerId].deck.slice(-(count as number)).reverse();
    const filter = (effect.params.filter ?? { subTypes: effect.params.subTypes, excludedNames: effect.params.excludedNames }) as CardFilter;
    if (effect.params.filter !== undefined && !validCardFilter(filter)) return { ...stack, effects: stack.effects.filter((_, i) => i !== index) };
    const cardRefs = cards.map(card => ({ cardUuid: card.uuid, zoneRevision: card.state.zoneRevision ?? 0 }));
    const clauses = effect.params.matchingClauses as { cardTypes: string[]; subTypes: string[] }[] | undefined;
    const matchingCount = cards.filter(card => {
      const value = CardCharacteristicService.resolve(room, card);
      return clauses?.some(clause => clause.cardTypes.some(type => value.cardTypes.some(actual => actual === type)) && clause.subTypes.some(type => value.subTypes.includes(type)));
    }).length;
    const first: EffectDefinition = effect.params.disposition === 'scorch'
      ? { action: 'ADD_COUNTER', params: { counterType: 'scorch', amount: matchingCount }, targeting: self,
          choice: { kind: 'selection', criteria: { type: 'permanent', controller: 'opponent', cardTypes: ['Creature', 'Artifact'], required: true, minTargets: 1, maxTargets: 1 } } }
      : { action: 'MOVE_ZONE', params: { origin: 'library', destination: 'hand' }, targeting: self,
        choice: { ...filter, kind: 'search', zone: 'library', cardRefs,
          min: effect.params.min as number | undefined ?? 0, max: effect.params.max as number | undefined ?? 1 } };
    definitions = [first,
      { action: 'REORDER_LIBRARY', params: { placement: 'bottom' }, targeting: self,
        choice: { kind: 'search', zone: 'library', cardRefs, ordered: true, allAvailable: true } },
    ];
    reveals = [...reveals ?? [], { cards: structuredClone(cards), sourceInfo: resolveSourceInformation(room, stack), controllerId: stack.controllerId }];
  } else return;
  return { ...stack, resolutionReveals: reveals,
    effects: [...stack.effects.slice(0, index), ...buildStackEffects(definitions, stack.controllerId, stack.source), ...stack.effects.slice(index + 1)] };
}
