import { z } from 'zod';
import { ModifierDefinitionSchema, parseContract, parseModifierDefinition, RuleContractError } from './contracts';
import { Identifier, PositiveCount } from './shared';

/** Marker-only counters can remain absent. Every declared counter owns at least one modifier. */
export const CounterDefinitionsSchema = z.record(
  Identifier,
  z.strictObject({ maxPerCard: PositiveCount.optional(), rules: z.array(ModifierDefinitionSchema).min(1) }),
);

export type CounterDefinitions = z.infer<typeof CounterDefinitionsSchema>;

/** Reuse modifier context checks and reject ambiguous identities within one counter. */
export function parseCounterDefinitions(input: unknown): CounterDefinitions {
  const definitions = parseContract(CounterDefinitionsSchema, input, 'counters');
  for (const [type, definition] of Object.entries(definitions)) {
    const ids = new Set<string>();
    definition.rules = definition.rules.map((rule, index) => {
      const path = `counters.${type}.rules.${index}`;
      const parsed = parseModifierDefinition(rule, path);
      if (ids.has(parsed.id)) throw new RuleContractError(path + '.id', 'Duplicate counter rule ID');
      ids.add(parsed.id);
      return parsed;
    });
  }
  return definitions;
}
