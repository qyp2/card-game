import type { CardInstance } from '../types/card.types';
import type { CardCharacteristics } from '../types/continuous-effect.types';
import type { CardResultSource, ResolutionCardResults } from '../types/resolution-result.types';
import { safeRuleKey } from './rule-path';

export interface CollectedCard {
  card: CardInstance;
  recordedCharacteristics?: CardCharacteristics;
}
/** Type guard for a resolution-result card source. */
export function validCardResultSource(value: unknown): value is CardResultSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return (
    Object.keys(source).every((key) => ['kind', 'name', 'view'].includes(key)) &&
    source.kind === 'result' &&
    typeof source.name === 'string' &&
    !!source.name.trim() &&
    safeRuleKey(source.name) &&
    (source.view === undefined || source.view === 'current' || source.view === 'recorded')
  );
}

/** Zone cards and recorded subsets share downstream filters. Missing context never falls back to all cards. */
export function collectCardSource(
  cards: CardInstance[],
  from?: CardResultSource,
  results?: ResolutionCardResults,
): CollectedCard[] | undefined {
  if (!from) return cards.map((card) => ({ card }));
  if (!validCardResultSource(from) || !results || !Object.prototype.hasOwnProperty.call(results, from.name))
    return undefined;
  const result = results[from.name];
  const anchors =
    result.kind === 'captured'
      ? result.cards.map((entry) => entry.before)
      : result.cards.flatMap((entry) => (entry.after ? [entry.after] : []));
  if (from.view === 'recorded')
    return anchors.map((snapshot) => ({
      card: snapshot.card,
      recordedCharacteristics: snapshot.card.lastKnownCharacteristics,
    }));
  const current = new Map(cards.map((card) => [card.uuid, card]));
  return anchors.flatMap((snapshot) => {
    const card = current.get(snapshot.card.uuid);
    return card &&
      card.state.zone === snapshot.card.state.zone &&
      (card.state.zoneRevision ?? 0) === (snapshot.card.state.zoneRevision ?? 0)
      ? [{ card }]
      : [];
  });
}
