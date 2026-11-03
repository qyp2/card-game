import type { GameRoom } from '../../types/game.room.types';
import type { ProposedEvent, ReplacementDefinition } from '../../types/proposed-event.types';
import { CardCharacteristicService } from '../../engine/card-characteristic-service';
import { scopeMatches } from '../../engine/effect-scopes';
import { conditionMatches, createRuleContext } from '../../engine/rule-conditions';
import { relativePlayerMatches } from '../../shared/card-query';
import { activeRules, ruleUse, ruleUseAvailable } from './active-rules';
import type { CardInstance } from '../../types/card.types';

/** The replacement engine supplies its current proposed-event recipient; no per-card handler is needed. */
export function staticEventReplacements(room: GameRoom, event: ProposedEvent, recipient: CardInstance | undefined, playerId: string): ReplacementDefinition[] {
  return activeRules(room).flatMap(active => {
    const rule = active.definition;
    if (rule.family !== 'event-replacements' || !rule.events.includes(event.kind)) return [];
    const use = ruleUse(active);
    if (!ruleUseAvailable(room, use)) return [];
    if (rule.scope.type === 'card') {
      if (!recipient || !scopeMatches(rule.scope.filter, recipient, CardCharacteristicService.resolve(room, recipient), active.source, active.controllerId)) return [];
    } else if (recipient || !relativePlayerMatches(playerId, rule.scope.relation, active.controllerId)) return [];
    const context = createRuleContext(room, active.source, active.controllerId, { eventId: event.kind, payload: event as unknown as Record<string, unknown> }, undefined,
      { target: recipient ? { ...recipient, ...CardCharacteristicService.resolve(room, recipient) } : room.players[playerId] });
    if (!conditionMatches(rule.condition, context)) return [];
    return [{ id: active.id, label: `${active.source.blueprint.name}: ${rule.id}`, operation: structuredClone(rule.operation), optional: rule.optional,
      source: { cardUuid: active.source.uuid, zoneRevision: active.source.state.zoneRevision ?? 0 }, ...(use ? { ruleUse: use } : {}) }];
  });
}
