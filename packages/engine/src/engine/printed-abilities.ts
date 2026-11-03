import type { CardBlueprint, CardAbility, ActivatedAbility } from '../types/card.types';

/** Preserve the prototype's implicit plain-land ability as a removable ability. */
export function printedAbilities(blueprint: CardBlueprint): CardAbility[] {
  // Guard: only bare lands need the synthesized ability. Anything that already
  // declares abilities, or is not a land, is returned as-is.
  if (blueprint.abilities.length || !blueprint.cardTypes.includes('Land')) {
    return structuredClone(blueprint.abilities);
  }

  // The prototype let plain lands tap for one yellow mana implicitly. Model that
  // as a real ability so it can be removed or modified like any other.
  const fallback: ActivatedAbility = {
    id: 'produce-yellow',
    type: 'activated',
    castSpeed: 'instant',
    cost: { tap: true },
    effect: {
      action: 'ADD_MANA',
      params: { color: 'yellow', amount: 1 },
      tags: [],
      targeting: { type: 'self', required: false },
    },
  };

  return [fallback];
}
