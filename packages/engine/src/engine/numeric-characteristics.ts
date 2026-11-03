import type { CardInstance, CardZone } from '../types/card.types';
import type { CardCharacteristics, CharacteristicNumber } from '../types/continuous-effect.types';
import type { NumericContext } from '../types/numeric-value.types';
import { readRulePath } from '../shared/rule-path';
import { scopeMatches } from './effect-scopes';
import { characteristicNumericValue, evaluateNumericValue } from '../shared/numeric-values';
export { characteristicNumericValue } from '../shared/numeric-values';

export interface BoardNumericContextOptions {
  cards: CardInstance[];
  characteristics: (card: CardInstance) => CardCharacteristics;
  source?: CardInstance;
  target?: CardInstance;
  controllerId?: string;
  fields?: Record<string, unknown>;
  defaultCountZones?: CardZone[];
}

/** The caller supplies either an intermediate board or the normal rules view. */
export function createBoardNumericContext(options: BoardNumericContextOptions): NumericContext {
  /** Present a card as its resolved characteristics, or undefined when absent. */
  const cardView = (card: CardInstance | undefined) => card ? { ...card, ...options.characteristics(card) } : undefined;

  return {
    readField: (path) => {
      const root = path.split('.')[0];
      const fields = options.fields ?? {};

      // `source` and `target` are synthesized from the card views unless the
      // caller explicitly supplied them.
      return readRulePath(
        root === 'source' && !Object.prototype.hasOwnProperty.call(fields, root)
          ? { source: cardView(options.source) }
          : root === 'target' && !Object.prototype.hasOwnProperty.call(fields, root)
            ? { target: cardView(options.target) }
            : fields,
        path,
      );
    },

    // The default count zones sit underneath any scope the caller supplied.
    count: (scope) =>
      options.cards.filter((card) =>
        scopeMatches(
          { ...(options.defaultCountZones ? { zones: options.defaultCountZones } : {}), ...scope },
          card,
          options.characteristics(card),
          options.source,
          options.controllerId,
        )).length,

    counterTotal: (scope, counterType) =>
      options.cards
        .filter((card) =>
          scopeMatches(
            { ...(options.defaultCountZones ? { zones: options.defaultCountZones } : {}), ...scope },
            card,
            options.characteristics(card),
            options.source,
            options.controllerId,
          ))
        .reduce((total, card) => total + (card.state.counters[counterType] ?? 0), 0),
  };
}

/** Evaluate a characteristic number, throwing when it cannot be resolved. */
export function requireCharacteristicNumber(value: CharacteristicNumber, context: NumericContext): number {
  const result = evaluateNumericValue(characteristicNumericValue(value), context);

  // Guard: an unresolved value is a rules bug, not a recoverable condition.
  if (!result.ok) throw new Error('Unresolved numeric characteristic: ' + result.reason);

  return result.value;
}
