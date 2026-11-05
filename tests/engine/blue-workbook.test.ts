import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { CardCharacteristicService } from '@engine/card-characteristic-service';
import { instantiateCard } from '@library/card-factory';
import { buildCatalog } from '@server/catalog/catalog';
import { deckEligibility, validateDeck } from '@card-game/protocol';
import blueDeck from '../../docs/decks/blue-giant-workbook.json';
import { actionPermission } from '../../packages/engine/src/shared/action-permissions';
import type { CardInstance, CardZone } from '@shared/card.types';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));

function card(id: string, zone: CardZone, player = 'player1') {
  const value = instantiateCard(id);
  value.state = { ...value.state, zone, ownerId: player, controllerId: player, summoningSickness: false };
  return value;
}

function game(...battlefield: CardInstance[]) {
  const room = createTestRoom({ battlefield });
  fillTestLibraries(room, 20);
  room.players.player1.hand = [];
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return engine;
}

function resolve(engine: GameEngine) {
  expect(engine.resolveTopOfStack().success).toBe(true);
}

function cast(engine: GameEngine, id: string) {
  const source = card(id, 'hand');
  engine.roomState.players.player1.hand.push(source);
  expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: source.uuid }).success).toBe(true);
  resolve(engine);
  return engine.roomState.battlefield.find(value => value.uuid === source.uuid)!;
}

function select(engine: GameEngine, ids: string[]) {
  const choice = engine.roomState.pendingChoice;
  expect(choice).toBeDefined();
  expect(engine.executePlayerAction(choice!.playerId, 'choose', { choiceId: choice!.id, choices: ids }).success).toBe(true);
}

function options(engine: GameEngine) {
  const choice = engine.roomState.pendingChoice;
  if (!choice || choice.kind === 'number') throw new Error('Expected a card or option choice');
  return choice.options;
}

function ids(cards: CardInstance[]) {
  return cards.map(value => value.uuid);
}

describe('blue workbook cards', () => {
  it.each([true, false])('Tassa keeps the reveal at six even with the Temple (accept=%s)', accept => {
    const engine = game(card('shifting-sea-temple', 'battlefield'));
    const player = engine.roomState.players.player1;
    const [outside, giant, otherTassa] = [card('sea-patrol', 'library'), card('sea-patrol', 'library'), card('phantom-sea-tassa', 'library')];
    const rest = Array.from({ length: 4 }, () => card('sea-domain', 'library'));
    player.deck = [outside, giant, otherTassa, ...rest];

    cast(engine, 'phantom-sea-tassa');
    resolve(engine);
    select(engine, accept ? ['reveal-six'] : []);

    if (accept) {
      const offered = options(engine);
      expect(offered).toHaveLength(1);
      expect(JSON.stringify(offered[0].value)).toContain(giant.uuid);
      select(engine, [offered[0].id]);
    }
    const result = engine.roomState.players.player1;
    expect(ids(result.hand)).toEqual(accept ? [giant.uuid] : []);
    expect(ids(result.graveyard)).toEqual(accept ? ids([otherTassa, ...rest].reverse()) : []);
    expect(result.deck).toHaveLength(accept ? 1 : 7);
    expect(result.deck[0].uuid).toBe(outside.uuid);
  });

  it('Haya takes a giant and a relic, keeps equipment out of that choice and independently mills its opponent', () => {
    const engine = game(card('shifting-sea-temple', 'battlefield'));
    const outside = card('sea-domain', 'library');
    const giant = card('sea-patrol', 'library');
    const relic = card('demon-sea-spire', 'library');
    const equipment = card('heavenly-lance', 'library');
    const rest = Array.from({ length: 3 }, () => card('sea-domain', 'library'));
    engine.roomState.players.player1.deck = [outside, giant, relic, equipment, ...rest];

    cast(engine, 'sea-god-caller-haya');
    const order = options(engine);
    select(engine, order.map(option => option.id));
    resolve(engine);
    if (!engine.roomState.pendingChoice) resolve(engine);
    select(engine, ['reveal-six']);
    for (const expected of [giant, relic]) {
      const offered = options(engine);
      expect(offered).toHaveLength(1);
      expect(JSON.stringify(offered[0].value)).toContain(expected.uuid);
      select(engine, [offered[0].id]);
    }
    if (engine.roomState.stack.length) resolve(engine);
    const { player1, player2 } = engine.roomState.players;
    expect(ids(player1.hand)).toEqual(ids([giant, relic]));
    expect(ids(player1.graveyard)).toEqual(ids([equipment, ...rest].reverse()));
    expect(ids(player1.deck)).toEqual([outside.uuid]);
    expect(player2.graveyard).toHaveLength(3);
  });

  it.each(['hand', 'library'] as const)('the Sunken Ship makes blue mana when discarded from %s', zone => {
    const engine = game();
    const ship = card('sunken-ship', zone);
    engine.roomState.players.player1[zone === 'hand' ? 'hand' : 'deck'].push(ship);
    engine.applyMutations([{
      type: 'MOVE_CARD', cardUuid: ship.uuid, playerId: 'player1', from: zone, to: 'graveyard', reason: 'discard',
    }]);
    resolve(engine);
    expect(engine.roomState.players.player1.mana.blue).toBe(6);
  });

  it('the Sunken Ship mills three even with the Temple', () => {
    const engine = game(card('shifting-sea-temple', 'battlefield'));
    cast(engine, 'sunken-ship');
    resolve(engine);
    expect(engine.roomState.players.player2.graveyard).toHaveLength(3);
  });

  it('the Illusionist bonus stacks with the Temple, applies to later arrivals and survives the Illusionist leaving', () => {
    const temple = card('shifting-sea-temple', 'battlefield');
    const enemy = card('sea-patrol', 'battlefield', 'player2');
    const engine = game(temple, enemy);
    const illusionist = cast(engine, 'seaborn-illusionist');
    resolve(engine);
    engine.applyMutations([{
      type: 'MOVE_CARD', cardUuid: illusionist.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard',
    }]);
    const patrol = cast(engine, 'sea-patrol');
    resolve(engine);
    expect(engine.roomState.players.player2.graveyard).toHaveLength(4);
    const bonus = (source: CardInstance) => CardCharacteristicService.resolve(engine.roomState, source).millBonus;
    expect(bonus(patrol)).toBe(2);
    expect(bonus(enemy)).toBeUndefined();
    engine.applyMutations([{ type: 'CLEAR_END_OF_TURN_EFFECTS' }]);
    expect(bonus(patrol)).toBe(1);
    engine.applyMutations([{
      type: 'MOVE_CARD', cardUuid: temple.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard',
    }]);
    expect(bonus(patrol)).toBeUndefined();
  });

  it('the Temple grants an attack trigger that keeps its mill bonus if the attacker leaves before resolution', () => {
    const temple = card('shifting-sea-temple', 'battlefield');
    const giant = card('sea-patrol', 'battlefield');
    const engine = game(temple, giant);
    expect(engine.executePlayerAction('player1', 'activate_ability', {
      cardUuid: temple.uuid, abilityId: 'grant-attack-mill', targets: [{ targetType: 'permanent', cardUuid: giant.uuid }],
    }).success).toBe(true);
    resolve(engine);
    engine.roomState.phase = 'declareAttackersStep';
    engine.roomState.priorityPlayerId = null;
    expect(engine.executePlayerAction('player1', 'declare_attackers', { attackers: [{ cardUuid: giant.uuid }] }).success).toBe(true);
    engine.applyMutations([
      { type: 'MOVE_CARD', cardUuid: giant.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' },
    ]);
    resolve(engine);
    expect(engine.roomState.players.player2.graveyard).toHaveLength(2);
    engine.applyMutations([
      { type: 'MOVE_CARD', cardUuid: giant.uuid, playerId: 'player1', from: 'graveyard', to: 'battlefield' },
    ]);
    const returned = engine.roomState.battlefield.find(value => value.uuid === giant.uuid)!;
    expect(CardCharacteristicService.resolveAbilities(engine.roomState, returned).map(ability => ability.id))
      .not.toContain(expect.stringContaining('temple-granted-attack-mill'));
  });

  it('the Spire bans small opposing spells on its controller’s attack phase and recovers one land per game', () => {
    const spire = card('demon-sea-spire', 'battlefield');
    const engine = game(spire);
    const room = engine.roomState;
    const small = card('sea-depths', 'hand', 'player2');
    const large = card('sea-depths', 'hand', 'player2');
    large.blueprint = {
      ...large.blueprint, castRequirements: { ...large.blueprint.castRequirements, cost: { mana: { blue: 4 } } },
    };
    const opposingGiant = card('sea-patrol', 'hand', 'player2');
    room.players.player2.hand.push(small, large, opposingGiant);
    const allowed = (source: CardInstance) => actionPermission(room, 'player2', source, 'cast').allowed;
    expect(allowed(small)).toBe(true);
    room.phase = 'declareAttackersStep';
    expect(allowed(small)).toBe(false);
    expect(allowed(large)).toBe(true);
    expect(allowed(opposingGiant)).toBe(true);
    room.activeTurnPlayerId = 'player2';
    expect(allowed(small)).toBe(true);

    room.phase = 'stateMainPhase';
    room.priorityPlayerId = 'player1';
    const land = card('sea-domain', 'graveyard');
    room.players.player1.graveyard.push(land, card('sea-domain', 'graveyard'));
    const activate = () => engine.executePlayerAction('player1', 'activate_ability', { cardUuid: spire.uuid, abilityId: 'recover-land' });
    expect(activate().success).toBe(true);
    resolve(engine);
    const selected = options(engine).find(option => JSON.stringify(option.value).includes(land.uuid));
    select(engine, [selected!.id]);
    expect(ids(engine.roomState.battlefield)).toContain(land.uuid);
    expect(engine.roomState.players.player1.graveyard).toHaveLength(1);
    expect(Object.values(engine.roomState.gameRuleUses ?? {})).toEqual([1]);
    engine.roomState.priorityPlayerId = 'player1';
    expect(activate().success).toBe(false);
  });
});


it('builds a 60-card blue deck under the workbook copy limits', () => {
  const standard = buildCatalog();
  const workbook = new Map([...standard].map(([id, entry]) => [id, {
    ...entry,
    copyLimit: entry.copyLimit === null ? null : deckEligibility.copyLimits[id] ?? 3,
  }]));
  expect(validateDeck(blueDeck, standard).valid).toBe(true);
  expect(validateDeck(blueDeck, workbook).valid).toBe(true);
  expect(blueDeck.cards.reduce((total, row) => total + row.quantity, 0)).toBe(60);
  const landCount = blueDeck.cards
    .filter(row => standard.get(row.cardId)?.cardTypes.includes('Land'))
    .reduce((total, row) => total + row.quantity, 0);
  expect(landCount).toBe(24);
  for (const { cardId } of blueDeck.cards) {
    const cost = instantiateCard(cardId).blueprint.castRequirements.cost?.mana ?? {};
    expect(Object.keys(cost).every(color => ['blue', 'generic'].includes(color))).toBe(true);
  }
});
