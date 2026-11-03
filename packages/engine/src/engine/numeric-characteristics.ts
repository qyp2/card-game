import type { CardInstance, CardZone } from '../types/card.types';
import type { CardCharacteristics, CharacteristicNumber } from '../types/continuous-effect.types';
import type { NumericContext } from '../types/numeric-value.types';
import { readRulePath } from '../shared/rule-path';
import { scopeMatches } from './effect-scopes';
import { characteristicNumericValue, evaluateNumericValue } from '../shared/numeric-values';
import { collectCardSource } from '../shared/card-collections';
import type { ResolutionCardResults } from '../types/resolution-result.types';
export { characteristicNumericValue } from '../shared/numeric-values';

export interface BoardNumericContextOptions {
  results?: ResolutionCardResults;
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
  const cardView = (card: CardInstance | undefined) => card ? { ...card, ...options.characteristics(card) } : undefined;
  const selected = (scope: import('../types/continuous-effect.types').EffectScope) => collectCardSource(options.cards, scope.from, options.results)?.filter(entry =>
    scopeMatches({ ...(!scope.from && options.defaultCountZones ? { zones: options.defaultCountZones } : {}), ...scope },
      entry.card, entry.recordedCharacteristics ?? options.characteristics(entry.card), options.source, options.controllerId));
  return {
    readField: path => {
      const root = path.split('.')[0];
      const fields = options.fields ?? {};
      return readRulePath(root === 'source' && !Object.prototype.hasOwnProperty.call(fields, root) ? { source: cardView(options.source) }
        : root === 'target' && !Object.prototype.hasOwnProperty.call(fields, root) ? { target: cardView(options.target) } : fields, path);
    },
    count: scope => selected(scope)?.length ?? NaN,
    counterTotal: (scope, counterType) => selected(scope)?.reduce((total, entry) => total + (entry.card.state.counters[counterType] ?? 0), 0) ?? NaN,
  };
}

export function requireCharacteristicNumber(value: CharacteristicNumber, context: NumericContext): number {
  const result = evaluateNumericValue(characteristicNumericValue(value), context);
  if (!result.ok) throw new Error('Unresolved numeric characteristic: ' + result.reason);
  return result.value;
}
