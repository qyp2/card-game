import type { CardInstance, ActivatedAbility, TriggeredAbility } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';
import type { GameMutation } from '../types/game-mutation.types';
import type { RuleUse } from '../types/rule.types';
import { recordRuleUse, ruleUseAvailable } from '../rules/runtime/active-rules';

type Ability = ActivatedAbility | TriggeredAbility;
/** Same period/identity contract as modifier usage; queries never consume it. */
export function abilityUsage(
  source: CardInstance,
  ability: Ability,
  controllerId = source.state.controllerId,
): RuleUse | undefined {
  const usage = ability.usage;
  if (!usage) return;
  let identity = `${source.uuid}:${source.state.zoneRevision ?? 0}`;
  if (usage.identity === 'source_card') identity = source.uuid;
  if (usage.identity === 'controller') {
    identity = controllerId;
    if (!usage.group) identity += ':' + source.blueprint.id;
  }
  return {
    key: usage.group ? `usage:${identity}:group:${usage.group}` : `ability-use:${identity}:${ability.id ?? ''}`,
    period: usage.period,
    limit: usage.limit,
  };
}
/** Read the budget with pending reservations included; never consume a use. */
export function abilityUsageAvailable(
  room: GameRoom,
  source: CardInstance,
  ability: Ability,
  reserved: GameMutation[] = [],
  controllerId?: string,
): boolean {
  const use = abilityUsage(source, ability, controllerId);
  if (!use) return true;
  const count = reserved.filter(
    (m) =>
      m.type === (use.period === 'game' ? 'RECORD_GAME_RULE_USE' : 'RECORD_ABILITY_USE') &&
      'key' in m &&
      m.key === use.key &&
      (m.type !== 'RECORD_ABILITY_USE' || (m.turnNumber ?? room.turnNumber ?? 1) === (room.turnNumber ?? 1)),
  ).length;
  return ruleUseAvailable(room, { ...use, limit: use.limit - count });
}
/** Produce the single committed usage debit for an ability budget. */
export function recordAbilityUsage(
  room: GameRoom,
  source: CardInstance,
  ability: Ability,
  controllerId?: string,
): GameMutation[] {
  const use = abilityUsage(source, ability, controllerId);
  return use ? [recordRuleUse(room, use)] : [];
}
