import type { CardSnapshot } from './card.types';
import type { ObjectReference } from './proposed-event.types';
/** Serializable causal identity, retained through replacements and source departure. */
export interface ChangeCause {
  id: string;
  rootId: string;
  parentId?: string;
  kind: 'effect' | 'combat' | 'command' | 'rule';
  source?: CardSnapshot;
  controllerId?: string;
  abilityId?: string;
  stackUuid?: string;
  instructionId?: string;
  eventUuid?: string;
  modifiers?: { ruleId: string; source?: CardSnapshot }[];
  killDestination?: 'exile';
}
export interface ChangeContribution {
  cause: ChangeCause;
  kind: 'damage' | 'characteristic' | 'state';
  amount: number;
  turnNumber: number;
}
export interface LethalAttribution {
  history?: ChangeContribution[];
  contributors: ChangeCause[];
  /** Causes of the transition from viable to lethal; simultaneous contributors share credit. */
  lethal?: ChangeCause[];
}
export interface KillOutcome {
  victim: ObjectReference;
  reason: 'destroy' | 'lethal';
  contributors?: ChangeCause[];
  history?: ChangeContribution[];
  causes: ChangeCause[];
}
