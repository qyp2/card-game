import { z } from 'zod';
import { Identifier, PlayerRelation } from './shared';

export const PermissionSchema = z.strictObject({ action: z.enum(['cast', 'activate']), mode: z.enum(['prohibit', 'instant']),
  players: PlayerRelation.optional(), abilityIds: z.array(Identifier).optional() });
export const PermissionOperationSchema = z.strictObject({ type: z.literal('PERMISSION'), rules: z.array(PermissionSchema).min(1) });
export type PermissionOperation = z.infer<typeof PermissionOperationSchema>;
