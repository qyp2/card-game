import type { CatalogCard } from '../rest/catalog';
export interface CatalogFilter {
    search: string;
    type: string;
    color: string;
    legalOnly: boolean;
}
export function filterCatalog(cards: readonly CatalogCard[], filter: CatalogFilter): CatalogCard[] { const q = filter.search.trim().toLowerCase(); return cards.filter(c => (!filter.legalOnly || c.deckLegal) && (!filter.type || c.cardTypes.includes(filter.type)) && (!filter.color || (filter.color === 'colorless' ? c.colors.length === 0 : c.colors.includes(filter.color))) && (!q || [c.id, c.name, c.rulesText, ...c.subTypes].join(' ').toLowerCase().includes(q))); }
export function changeCardCounts(entries: readonly {
    cardId: string;
    quantity: number;
}[], cardId: string, delta: number, max = 250) { const next = (entries.find(e => e.cardId === cardId)?.quantity ?? 0) + delta; if (!Number.isSafeInteger(delta) || next > max)
    return [...entries]; return [...entries.filter(e => e.cardId !== cardId), ...(next > 0 ? [{ cardId, quantity: next }] : [])].sort((a, b) => a.cardId.localeCompare(b.cardId)); }
