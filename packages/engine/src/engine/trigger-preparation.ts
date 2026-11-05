import type { GameRoom } from '../types/game.room.types';
import type { StackEffect, TargetGroupDefinition, TriggeredStackObject } from '../types/effect.types';
import { describeTargetGroups, isExplicitTargeting } from '../shared/target-legality';
import { selectModeEffects } from '../shared/action-modes';
import { abilityEffects } from './ability-effects';
import { buildStackEffects } from './resolution-planning';
import { choiceCanComplete, targetOptions } from './choices';
import { resolveSourceInformation } from './source-information';

/** Target groups share one target count; every divided instruction also constrains that count. */
export function triggerTargetGroups(effects: StackEffect[]): TargetGroupDefinition[] {
  return describeTargetGroups(
    effects.map((effect) => ({ ...effect, targeting: effect.targeting ?? { type: 'self', required: false } })),
  ).map((group) => {
    let min = group.targeting.minTargets ?? (group.targeting.required ? 1 : 0);
    let max = group.targeting.maxTargets ?? 1;
    effects.forEach((effect, index) => {
      if (
        effect.choice?.kind !== 'distribution' ||
        !isExplicitTargeting(effect.targeting) ||
        (effect.targetGroup ?? `effect-${index}`) !== group.id
      )
        return;
      // Each selected target receives at least one unit. A zero division can
      // select no targets; a positive division needs at least one recipient.
      min = Math.max(min, effect.choice.total > 0 ? 1 : 0);
      max = Math.min(max, effect.choice.total);
    });
    return { ...group, targeting: { ...group.targeting, minTargets: min, maxTargets: max } };
  });
}

/** Query the same group bounds/options used by scheduling; no choices, uses or mutations are produced. */
function effectsCanBePrepared(room: GameRoom, object: TriggeredStackObject, effects: StackEffect[]): boolean {
  try {
    const groups = triggerTargetGroups(effects);
    if (!groups.length) return true;
    const source = resolveSourceInformation(room, object).card;
    return groups.every((group) =>
      choiceCanComplete({
        kind: 'targets',
        min: group.targeting.minTargets!,
        max: group.targeting.maxTargets!,
        options: targetOptions(room, object.controllerId, source, group.targeting),
      }),
    );
  } catch {
    // Conflicting shared-group definitions are an impossible preparation, not
    // permission to enqueue an ability that will fail during a later prompt.
    return false;
  }
}

/** Enumerate legal ordered mode selections, pruning prefixes that additional effects cannot repair. */
function* modeSets(
  ids: string[],
  min: number,
  max: number,
  feasible: (ids: string[]) => boolean,
  includes?: string,
  selected: string[] = [],
): Generator<string[]> {
  if (!feasible(selected)) return;
  if (selected.length >= min && (!includes || selected.includes(includes))) yield selected;
  if (selected.length >= max || selected.length + ids.length < min) return;
  // Try a required option first for the mode menu, while still considering
  // every order. Explicit group IDs can collide with position-based group IDs.
  const next = includes && ids.includes(includes) ? [includes, ...ids.filter((id) => id !== includes)] : ids;
  for (const id of next)
    yield* modeSets(
      ids.filter((other) => other !== id),
      min,
      max,
      feasible,
      includes,
      [...selected, id],
    );
}

/** A modal ability is eligible if at least one allowed selection has satisfiable required targets. */
function someModeSet(room: GameRoom, object: TriggeredStackObject, includes?: string): boolean {
  const ability = object.ability!;
  const modes = ability.modes!;
  const count = ability.modeCount ?? { min: 1, max: 1 };
  const feasible = (ids: string[]): boolean => {
    // Relax only the minimum while exploring prefixes. Adding effects cannot
    // supply missing targets or repair an inconsistent existing target group.
    const selected = selectModeEffects(abilityEffects(ability), modes, ids, { min: 0, max: count.max });
    return (
      !!selected && effectsCanBePrepared(room, object, buildStackEffects(selected, object.controllerId, object.source))
    );
  };
  const selections = modeSets(
    modes.map((mode) => mode.id),
    count.min,
    Math.min(count.max, modes.length),
    feasible,
    includes,
  );
  return !selections.next().done;
}

/** Admission gate before trigger accounting. Optional targets and untargeted effects remain eligible. */
export function canPrepareTrigger(room: GameRoom, object: TriggeredStackObject, selectedModes?: unknown): boolean {
  const ability = object.ability;
  if (!ability?.modes?.length) return effectsCanBePrepared(room, object, object.effects);
  if (selectedModes === undefined) return someModeSet(room, object);
  const selected = selectModeEffects(abilityEffects(ability), ability.modes, selectedModes, ability.modeCount);
  return (
    !!selected && effectsCanBePrepared(room, object, buildStackEffects(selected, object.controllerId, object.source))
  );
}

/** Offer a mode only when it belongs to a complete legal set; validate the submitted combination too. */
export function availableTriggerModes(room: GameRoom, object: TriggeredStackObject) {
  return (object.ability?.modes ?? []).filter((mode) => someModeSet(room, object, mode.id));
}
