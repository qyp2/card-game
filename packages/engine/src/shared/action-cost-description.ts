import type { AuthoredActionCost } from '../types/effect.types';

/** Small display formatter; gameplay still materializes and pays costs in the engine. */
export function describeActionCost(cost?: AuthoredActionCost): string {
  if (!cost) return 'No additional cost';
  return (
    [
      ...Object.entries(cost.mana ?? {})
        .filter(([, amount]) => amount)
        .map(([color, amount]) => `${typeof amount === 'number' ? amount : 'Announced'} ${color} mana`),
      ...(cost.removeCounters ?? []).map((counter) => {
        const place = counter.from === 'source' ? 'this card' : 'matching cards you control';
        return `Remove ${counter.amount} ${counter.counterType} counters from ${place}`;
      }),
      ...(cost.destroyMaterials
        ? [`Destroy materials with total mana value greater than ${cost.destroyMaterials.manaValueGreaterThan}`]
        : []),
      ...(cost.life ? [`${cost.life} life`] : []),
      ...(cost.tap ? ['Tap source'] : []),
      ...(cost.untap ? ['Untap source'] : []),
      ...(cost.discard ? [`Discard ${cost.discard}`] : []),
      ...(cost.sacrifice ? ['Sacrifice source'] : []),
      ...(cost.discardSelf ? ['Discard source'] : []),
    ].join(', ') || 'No additional cost'
  );
}
