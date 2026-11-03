import type { CardSnapshot } from './card.types';

/** A query source local to one resolving spell/ability. It never owns live cards. */
export interface CardResultSource {
  kind: 'result';
  name: string;
  /** Current exact incarnations for actions; immutable arrival snapshots for historical counts. */
  view?: 'current' | 'recorded';
}
export interface CardResultDefinition { name: string; kind: 'milled' }
export interface ResolutionCardResult extends CardResultDefinition {
  /** Attempts retain provenance; only successful moves have an arrival snapshot. */
  cards: { before: CardSnapshot; after?: CardSnapshot }[];
}
export type ResolutionCardResults = Record<string, ResolutionCardResult>;
