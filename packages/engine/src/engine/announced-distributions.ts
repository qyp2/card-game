import type { ActionData } from './action-registry';
import type { StackEffect } from '../types/effect.types';
import { isExplicitTargeting, targetKey } from '../shared/target-legality';

/** Targeted divisions are locked at announcement and never redistributed at resolution. */
export function planAnnouncedDistributions(effects: StackEffect[], data: ActionData): { success: true; effects: StackEffect[] } | { success: false; reason: string } {
  const supplied = data.distributions;

  // Guard: the supplied payload must be a plain object when present.
  if (supplied !== undefined && (!supplied || typeof supplied !== 'object' || Array.isArray(supplied))) {
    return { success: false, reason: 'Invalid distributions' };
  }

  const divisions = (supplied ?? {}) as Record<string, Record<string, number>>;

  // Only effects that declare a distribution choice over explicit targets can be
  // divided; they are keyed by their position in the effect list.
  const ids = effects.flatMap((effect, index) =>
    effect.choice?.kind === 'distribution' && isExplicitTargeting(effect.targeting) ? [`effect-${index}`] : []);

  // Guard: every supplied division must correspond to a divisible effect.
  if (Object.keys(divisions).some((id) => !ids.includes(id))) {
    return { success: false, reason: 'Unknown distribution' };
  }

  const result: StackEffect[] = [];

  for (let index = 0; index < effects.length; index++) {
    const effect = effects[index];

    // Effects without a distribution choice pass through untouched.
    if (effect.choice?.kind !== 'distribution' || !isExplicitTargeting(effect.targeting)) {
      result.push(effect);
      continue;
    }

    const allocation = divisions[`effect-${index}`];
    const keys = effect.targets.map(targetKey);

    // Guard: the allocation must cover exactly the effect's targets, give each a
    // positive integer, and add up to the announced total.
    if (
      !allocation ||
      typeof allocation !== 'object' ||
      Array.isArray(allocation) ||
      Object.keys(allocation).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Number.isSafeInteger(allocation[key]) || allocation[key] < 1) ||
      Object.values(allocation).reduce((sum, amount) => sum + amount, 0) !== effect.choice.total
    ) {
      return { success: false, reason: 'Announce a valid division among all targets' };
    }

    const field = effect.choice.field ?? 'amount';

    // Negative base values (e.g. -X/-X) keep their sign when divided.
    const sign = typeof effect.params[field] === 'number' && (effect.params[field] as number) < 0 ? -1 : 1;

    // Split the effect into one single-target copy per target.
    result.push(...effect.targets.map((target) => ({
      ...effect,
      choice: undefined,
      targets: [target],
      params: { ...effect.params, [field]: allocation[targetKey(target)] * sign },
    })));
  }

  return { success: true, effects: result };
}
