import type { CardInstance } from '../../types/card.types';
import type { GameRoom } from '../../types/game.room.types';
import type { GameMutation } from '../../types/game-mutation.types';
import type { RuleUse } from '../../types/rule.types';
export type { RuleUse } from '../../types/rule.types';
import type { ModifierDefinition } from '../schema/contracts';
import { CardCharacteristicService, withCharacteristicCache } from '../../engine/card-characteristic-service';
import { roomCards } from '../../engine/continuous-effect-state';

export interface ActiveRule<R extends ModifierDefinition = ModifierDefinition> {
  definition: R;
  source: CardInstance;
  controllerId: string;
  abilityId: string;
  id: string;
}
const frozenDefinitions = new WeakMap<object, boolean>();
function containsEvaluatedRule(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  const cached = Object.isFrozen(value) ? frozenDefinitions.get(value) : undefined;
  if (cached !== undefined) return cached;
  seen.add(value);
  const result = 'family' in value && (value.family === 'costs' || value.family === 'event-replacements')
    || Object.values(value).some(child => containsEvaluatedRule(child, seen));
  if (Object.isFrozen(value)) frozenDefinitions.set(value, result);
  return result;
}

/** Discover effective static rules; removed abilities and new source incarnations are respected. */
export function activeRules(room: GameRoom): ActiveRule[] {
  const cards = roomCards(room);
  // A conservative gate includes rule grants/copies. Only immutable definitions are cached, never mutable room state.
  if (!cards.some(card => containsEvaluatedRule(card.blueprint)) && !containsEvaluatedRule(room.continuousEffectPool)) return [];
  return withCharacteristicCache(room, () => cards.flatMap(source => {
    const view = CardCharacteristicService.resolve(room, source);
    return view.abilities.flatMap(ability => ability.type !== 'static' || !(ability.activeZones ?? ['battlefield']).includes(source.state.zone) ? []
      : (ability.rules ?? []).map(definition => ({ definition, source, controllerId: view.controllerId, abilityId: ability.id,
        id: `rule:${source.uuid}:${source.state.zoneRevision ?? 0}:${ability.id}:${definition.id}` })));
  }));
}
export function ruleUse(active: ActiveRule): RuleUse | undefined {
  const usage = 'usage' in active.definition ? active.definition.usage : undefined;
  if (!usage) return;
  const identity = usage.identity === 'controller' ? `${active.controllerId}:${active.source.blueprint.id}`
    : usage.identity === 'source_card' ? active.source.uuid : `${active.source.uuid}:${active.source.state.zoneRevision ?? 0}`;
  return { key: `rule-use:${identity}:${active.abilityId}:${active.definition.id}`, period: usage.period, limit: usage.limit };
}
export function ruleUseAvailable(room: GameRoom, use: RuleUse | undefined): boolean {
  return !use || (use.period === 'game' ? room.gameRuleUses?.[use.key] ?? 0 : room.turnHistory?.uses[use.key] ?? 0) < use.limit;
}
export function recordRuleUse(room: GameRoom, use: RuleUse): GameMutation {
  return use.period === 'turn' ? { type: 'RECORD_ABILITY_USE', key: use.key, turnNumber: room.turnNumber ?? 1 }
    : { type: 'RECORD_GAME_RULE_USE', key: use.key };
}
