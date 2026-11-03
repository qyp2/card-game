import type { CardSnapshot } from './card.types';

export type DamageRecipient =
  | { kind: 'player'; playerId: string }
  | { kind: 'permanent'; cardUuid: string; zoneRevision: number };

export interface DamageAssignment {
  cause?: import('./change-cause.types').ChangeCause;
  source: CardSnapshot;
  recipient: DamageRecipient;
  amount: number;
  combat: boolean;
  preventable?: boolean;
}
