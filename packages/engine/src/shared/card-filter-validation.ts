import { MANA_COLORS } from '../types/card.types';
import type { CardFilter } from '../types/card-query.types';

/** Keep numeric scope queries and authored filters declarative and bounded. */
export function validCardFilter(value: unknown, depth = 0): value is CardFilter {
  if (depth > 24 || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((item) => typeof item === 'string');
  const bounds = (v: unknown, counter = false): boolean =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.entries(v).every(([key, n]) =>
      counter && key === 'type'
        ? typeof n === 'string' && !!n
        : ['min', 'max'].includes(key) && typeof n === 'number' && Number.isFinite(n),
    ) &&
    (!counter || typeof (v as { type?: unknown }).type === 'string') &&
    (!('min' in v && 'max' in v) || (v as { min: number }).min <= (v as { max: number }).max);
  return Object.entries(value).every(([key, item]) => {
    switch (key) {
      case 'ids':
      case 'cardTypes':
      case 'subTypes':
      case 'names':
      case 'excludedNames':
        return strings(item);
      case 'colors':
        return strings(item) && item.every((color) => MANA_COLORS.includes(color as (typeof MANA_COLORS)[number]));
      case 'nameContains':
        return typeof item === 'string';
      case 'controller':
      case 'owner':
        return ['self', 'opponent', 'any'].includes(item as string);
      case 'power':
      case 'toughness':
      case 'manaValue':
        return bounds(item);
      case 'counter':
        return bounds(item, true);
      case 'tapped':
        return typeof item === 'boolean';
      case 'summonKind':
        return item === 'cast' || item === 'effect';
      case 'allOf':
      case 'anyOf':
        return Array.isArray(item) && item.every((child) => validCardFilter(child, depth + 1));
      case 'not':
        return validCardFilter(item, depth + 1);
      default:
        return false;
    }
  });
}
