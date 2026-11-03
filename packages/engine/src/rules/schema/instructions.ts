import { z } from 'zod';
import { Color, Count, Identifier, EffectNumber, EffectCount, LifetimeSchema, Numeric, Zone, CardFilterSchema } from './shared';
import { AuthoredReplacementSchema } from './event-replacements';

/** Functional public names map explicitly to the existing execution primitives. */
export const InstructionNames = {
  ATTACH: ['attachments', 'attach'], CLAIM_REVEALED_SELF: ['cards', 'claim_revealed_source'], DISCARD_FROM_LIBRARY: ['cards', 'mill'],
  DISCARD_FROM_HAND: ['cards', 'discard'], DISCARD_HAND: ['cards', 'discard_hand'], DRAW: ['cards', 'draw'], SHUFFLE: ['cards', 'shuffle'],
  REORDER_LIBRARY: ['cards', 'reorder_library'], REVEAL_TOP: ['cards', 'reveal_top'], MOVE_ZONE: ['cards', 'move'],
  DESTROY: ['cards', 'destroy'], SACRIFICE: ['cards', 'sacrifice'], COUNTER: ['stack', 'counter'], TAP: ['orientation', 'tap'], UNTAP: ['orientation', 'untap'],
  MODIFY_LIFE: ['resources', 'adjust_life'], ADD_MANA: ['resources', 'add_mana'], DEAL_DAMAGE: ['damage', 'deal'], MODIFY_STATS: ['characteristics', 'adjust_stats_and_damage'],
  ADD_COUNTER: ['counters', 'add'], REMOVE_COUNTER: ['counters', 'remove'], GRANT_STATS: ['characteristics', 'temporary_stats'], SET_STATS: ['characteristics', 'set_stats'],
  CREATE_CONTINUOUS_EFFECT: ['characteristics', 'create_effect'], CREATE_REPLACEMENT_EFFECT: ['event-replacements', 'create_effect'],
  REGENERATE: ['event-replacements', 'regenerate'], CREATE_DELAYED_TRIGGER: ['triggers', 'delay'],
} as const;
export type InstructionAction = keyof typeof InstructionNames;

export function instructionParameterSchemas(characteristic: z.ZodType, ability: () => z.ZodType) {
  const empty = z.strictObject({});
  const stats = { power: EffectNumber.optional(), toughness: EffectNumber.optional() };
  const nonemptyStats = z.strictObject(stats).refine(v => v.power !== undefined || v.toughness !== undefined, 'Stat change requires a value');
  return {
    ATTACH: empty, CLAIM_REVEALED_SELF: z.strictObject({ discard: z.boolean().optional() }),
    DISCARD_FROM_LIBRARY: z.strictObject({ amount: EffectCount }), DISCARD_FROM_HAND: z.strictObject({ amount: EffectCount }), DISCARD_HAND: empty,
    DRAW: z.strictObject({ amount: EffectCount }), SHUFFLE: empty, REORDER_LIBRARY: z.strictObject({ placement: z.enum(['top', 'bottom']) }),
    REVEAL_TOP: z.strictObject({ amount: Count.min(1).max(3), filter: CardFilterSchema.optional(), min: Count.optional(), max: Count.optional(),
      subTypes: z.array(Identifier).optional(), excludedNames: z.array(z.string()).optional(), disposition: z.literal('scorch').optional(),
      matchingClauses: z.array(z.strictObject({ cardTypes: z.array(Identifier), subTypes: z.array(Identifier) })).optional() })
      .refine(v => !v.filter || (!v.subTypes && !v.excludedNames), 'Use one shared reveal filter')
      .refine(v => (v.min ?? 0) <= (v.max ?? 1) && (v.max ?? 1) <= v.amount, 'Invalid reveal selection bounds'),
    MOVE_ZONE: z.strictObject({ origin: Zone.optional(), destination: Zone, libraryPlacement: z.enum(['top', 'bottom']).optional() })
      .refine(v => !v.libraryPlacement || v.destination === 'library', 'Library placement requires a library destination'),
    DESTROY: empty, SACRIFICE: empty, COUNTER: empty, TAP: empty, UNTAP: empty,
    MODIFY_LIFE: z.strictObject({ amount: EffectNumber }),
    ADD_MANA: z.strictObject({ color: Color.optional(), colors: z.array(Color).min(1).optional(), amount: Count.min(1) })
      .refine(v => !!v.color !== !!v.colors, 'Choose color or colors'),
    DEAL_DAMAGE: z.strictObject({ amount: EffectCount }),
    MODIFY_STATS: z.strictObject({ ...stats, damage: EffectNumber.optional() }).refine(v => Object.keys(v).length > 0, 'Stat/damage change requires a value'),
    ADD_COUNTER: z.strictObject({ counterType: Identifier, amount: EffectCount }), REMOVE_COUNTER: z.strictObject({ counterType: Identifier, amount: EffectCount }),
    GRANT_STATS: nonemptyStats,
    SET_STATS: z.strictObject({ power: Numeric, toughness: Numeric, duration: LifetimeSchema.optional(), requiredZone: Zone.nullable().optional() }),
    CREATE_CONTINUOUS_EFFECT: z.strictObject({ effect: characteristic, duration: LifetimeSchema.optional(), requiredZone: Zone.nullable().optional() }),
    CREATE_REPLACEMENT_EFFECT: z.strictObject({ definition: AuthoredReplacementSchema }), REGENERATE: empty,
    CREATE_DELAYED_TRIGGER: z.strictObject({ ability: z.lazy(ability), lifetime: z.enum(['once', 'end_of_turn', 'permanent']).optional() }),
  } satisfies Record<InstructionAction, z.ZodType>;
}
