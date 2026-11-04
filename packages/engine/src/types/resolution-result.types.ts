import type { CardSnapshot } from './card.types';

/** A query source local to one resolving spell/ability. It never owns live cards. */
export interface CardResultSource {
  kind: 'result';
  name: string;
  /** Current exact incarnations for actions; immutable capture/arrival snapshots for historical counts. */
  view?: 'current' | 'recorded';
}
export type CardResultDefinition = { name: string; kind: 'milled' | 'captured' };
export interface MilledCardResult {
  name: string;
  kind: 'milled';
  /** Attempts retain provenance; only successful moves have an arrival snapshot. */
  cards: { before: CardSnapshot; after?: CardSnapshot }[];
  observationId?: never;
}
export interface CapturedCardResult {
  name: string;
  kind: 'captured';
  observationId: string;
  /** An unmoved observation anchors membership without pretending to be a zone arrival. */
  cards: { before: CardSnapshot; after?: never }[];
}
export type ResolutionCardResult = MilledCardResult | CapturedCardResult;
export type ResolutionCardResults = Record<string, ResolutionCardResult>;
