import type { ActivatedAbility, TriggeredAbility } from '../types/card.types';
import type { EffectDefinition } from '../types/effect.types';

/** Adapt legacy single effects at the boundary; abilities share one ordered list. */
export function abilityEffects(ability: ActivatedAbility | TriggeredAbility): EffectDefinition[] {
  // Modern shape: an explicit ordered list of effects.
  if (ability.effects) return ability.effects;

  // Legacy shape: a single effect, wrapped so callers always see a list.
  return ability.effect ? [ability.effect] : [];
}
