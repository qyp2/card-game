import { z } from 'zod';
import { consistentObservationVisibility, observationLimits } from '../../shared/observation-policy';
import { CardFilterSchema, CardResultSourceSchema } from './shared';

const role = z.enum(['controller', 'opponent', 'zone_owner', 'all_players']);
const audience = z
  .array(role)
  .max(4)
  .refine((values) => new Set(values).size === values.length, 'Duplicate audience role');
export const ObservationVisibilitySchema = z
  .strictObject({
    faces: audience,
    count: audience,
    order: audience,
    expires: z.literal('resolution_end'),
  })
  .refine(consistentObservationVisibility, 'Faces require count visibility; order requires face visibility');
const event = z.enum(['none', 'revealed']).optional();
const publicReveal = (value: { event?: string; visibility?: z.infer<typeof ObservationVisibilitySchema> }) =>
  value.event !== 'revealed' || !!value.visibility?.faces.includes('all_players');
export const CaptureWindowSchema = z
  .strictObject({
    zone: z.literal('library'),
    zonePlayer: z.enum(['self', 'opponent']).optional(),
    position: z.literal('top'),
    amount: z.number().int().min(1).max(observationLimits.maxWindowCards),
    visibility: ObservationVisibilitySchema.optional(),
    event,
  })
  .refine(publicReveal, 'A revealed event requires explicit public face visibility');
export const CollectionVisibilitySchema = z
  .strictObject({
    from: CardResultSourceSchema.extend({ view: z.literal('current').optional() }),
    filter: CardFilterSchema.optional(),
    visibility: ObservationVisibilitySchema,
    event,
  })
  .refine(publicReveal, 'A revealed event requires explicit public face visibility');
