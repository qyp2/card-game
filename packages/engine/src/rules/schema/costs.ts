import { z } from 'zod';
import { Color, CountExpression } from './shared';

export const CostOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('mana.increase'), color: z.union([Color, z.literal('generic')]), amount: CountExpression }),
  z.strictObject({ type: z.literal('mana.reduce'), color: z.union([Color, z.literal('generic')]), amount: CountExpression }),
  z.strictObject({ type: z.literal('mana.set_base'), color: z.union([Color, z.literal('generic')]), amount: CountExpression }),
  z.strictObject({ type: z.literal('mana.waive_base') }),
]);
export type CostOperation = z.infer<typeof CostOperationSchema>;
