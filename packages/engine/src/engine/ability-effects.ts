import type { ActivatedAbility, TriggeredAbility } from '../types/card.types';
import type { EffectDefinition } from '../types/effect.types';

/** Single and ordered instruction forms share one execution list. */
export function abilityEffects(ability: ActivatedAbility | TriggeredAbility): EffectDefinition[] {
  if (ability.effects) return ability.effects;
  return ability.effect ? [ability.effect] : [];
}
