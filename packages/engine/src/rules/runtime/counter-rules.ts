import configuredCounters from '../../config/rules/counters-v1.json';
import type { CardInstance } from '../../types/card.types';
import { compileStaticRules } from '../schema/compile';
import { parseCounterDefinitions } from '../schema/counters';

const definitions = new Map(
  Object.entries(parseCounterDefinitions(configuredCounters)).map(
    ([type, definition]) =>
      [
        type,
        {
          type,
          maxPerCard: definition.maxPerCard,
          rules: definition.rules,
          effects: compileStaticRules(definition.rules),
        },
      ] as const,
  ),
);

/** Read one definition per present counter type. Rules belong to the current battlefield holder. */
export function counterRulesFor(holder: CardInstance) {
  if (holder.state.zone !== 'battlefield') return [];
  return Object.entries(holder.state.counters).flatMap(([type, count]) => {
    const definition = definitions.get(type);
    return count > 0 && definition ? [definition] : [];
  });
}

/** The key survives counter removal and reapplication but distinguishes a returned card. */
export function counterRuleKey(holder: CardInstance, type: string): string {
  return 'counter:' + JSON.stringify([holder.uuid, holder.state.zoneRevision ?? 0, type]);
}

/** Compute a placement against the authored cap at the point it commits. */
export function counterCountAfterPlacement(type: string, current: number, amount: number): number {
  const cap = definitions.get(type)?.maxPerCard;
  if (cap === undefined) return current + amount;
  return Math.min(cap, current + amount);
}
