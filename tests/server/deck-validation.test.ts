import { describe, expect, it } from 'vitest';
import { CatalogResponseSchema, newScenario, validateDeck, type DeckInput } from '@card-game/protocol';
import { buildCatalog } from '@server/catalog/catalog';
import { DeckService, InvalidDeckError } from '@server/decks/deck-service';
import { InMemoryDeckStore } from '@server/decks/deck-store';
import { getBlueprint } from '@library/card-catalog';
import { buildScenarioRoom, scenarioRandom } from '@engine/scenario-setup';
import { randomUUID } from 'node:crypto';

const catalog = buildCatalog();
const valid: DeckInput = { name: 'Constructed', format: 'standard', cards: [{ cardId: 'land-red', quantity: 56 }, { cardId: 'empire-servant', quantity: 4 }] };
describe('shared deck rules and catalog boundary', () => {
  it('constructs a lab scenario using the new canonical cards', () => {
    const ids = ['frost-giant', 'frost-soul', 'heavenly-gate', 'heavenly-gatekeeper', 'heavenly-lance', 'heavenly-marquis-laila', 'heavenly-patrol', 'shadowwood-sword', 'thunder-devouring-holy-sword', 'vitality-wood-staff',
      'phantom-sapper', 'worlds-wind-envoy', 'heavenly-land-envoy-reila', 'heavenly-seeker-yela', 'wind-spirit-prophet'];
    const scenario = newScenario(); scenario.openingHandSize = 0;
    scenario.players[0].battlefield = ids.map(cardId => ({ cardId, quantity: 1 }));
    const room = buildScenarioRoom('workbook-data-only', ['player1', 'player2'], scenario, { uuid: randomUUID, random: scenarioRandom(1) });
    expect(room.battlefield.map(card => card.blueprint.id)).toEqual(ids);
    expect(room.battlefield.every(card => card.state.ownerId === 'player1' && card.state.controllerId === 'player1')).toBe(true);
  });
  it.each([
    'heavenly-lance', 'thunder-devouring-holy-sword', 'heavenly-gatekeeper', 'heavenly-patrol', 'frost-soul',
    'heavenly-marquis-laila', 'shadowwood-sword', 'vitality-wood-staff', 'frost-giant', 'heavenly-gate',
    'phantom-sapper', 'worlds-wind-envoy', 'heavenly-land-envoy-reila', 'heavenly-seeker-yela', 'wind-spirit-prophet',
  ])('publishes new workbook card %s for deck and scenario consumers', cardId => {
    expect(catalog.get(cardId)).toMatchObject({ id: cardId, deckLegal: true, copyLimit: 4 });
    expect(validateDeck({ ...valid, cards: [{ cardId: 'land-red', quantity: 59 }, { cardId, quantity: 1 }] }, catalog).valid).toBe(true);
  });
  it('permits an explicit repeatable land while enforcing minimum/maximum and four copies', () => {
    expect(validateDeck(valid, catalog).valid).toBe(true);
    for (const quantity of [1, 59, 251]) expect(validateDeck({ ...valid, cards: [{ cardId: 'land-red', quantity }] }, catalog).valid).toBe(false);
    const result = validateDeck({ ...valid, cards: [{ cardId: 'land-red', quantity: 55 }, { cardId: 'empire-servant', quantity: 5 }] }, catalog);
    expect(result).toEqual({ valid: false, issues: [{ code: 'copy_limit', cardId: 'empire-servant', message: 'Use at most 4 copies of this card.' }] });
  });
  it.each(['rock', 'paper', 'scissors', 'trigger-probe', 'choice-practice', 'counterspell-fixture', 'ability-counter-fixture', 'unknown', 'toString'])('rejects illegal/unknown card %s', cardId => {
    expect(validateDeck({ ...valid, cards: [{ cardId: 'land-red', quantity: 59 }, { cardId, quantity: 1 }] }, catalog).valid).toBe(false);
  });
  it('rejects duplicate entries, role/owner injection, fractions and oversized lists', () => {
    for (const input of [
      { ...valid, cards: [{ cardId: 'land-red', quantity: 30 }, { cardId: 'land-red', quantity: 30 }] },
      { ...valid, ownerId: 'other' }, { ...valid, cards: [{ cardId: 'land-red', quantity: 60.5 }] },
      { ...valid, cards: Array(251).fill({ cardId: 'land-red', quantity: 1 }) },
    ]) expect(validateDeck(input, catalog).valid).toBe(false);
  });
  it('publishes safe printed fields without blueprints, effects, abilities or match state', () => {
    const cards = [...catalog.values()];
    expect(CatalogResponseSchema.safeParse({ protocolVersion: 1, cards, offset: 0, limit: 100, total: cards.length }).success).toBe(true);
    const encoded = JSON.stringify(cards);
    for (const field of ['"abilities"', '"onCastEffects"', '"castRequirements"', '"uuid"', '"state"']) expect(encoded).not.toContain(field);
    expect(catalog.get('land-red')?.copyLimit).toBeNull(); expect(catalog.get('sea-domain')?.copyLimit).toBe(4);
    expect(() => getBlueprint('toString')).toThrow('Unknown');
  });
  it('bounds saved-deck creation and returns shared validation issues without mutation', () => {
    const repository = new InMemoryDeckStore(), service = new DeckService(repository, catalog, () => 1);
    for (let i = 0; i < 100; i++) service.create('owner', valid);
    expect(() => service.create('owner', valid)).toThrow('capacity');
    expect(service.list('other', 0, 100).total).toBe(0);
    const previous = service.list('owner', 0, 1).decks[0];
    expect(() => service.update('other', previous.id, valid)).toThrow('not found');
    expect(() => service.update('owner', previous.id, { ...valid, cards: [] })).toThrow(InvalidDeckError);
    expect(service.get('owner', previous.id)).toEqual(previous);
  });
});
