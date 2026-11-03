import { afterEach, describe, expect, it } from 'vitest';
import { collectCards, matchesCardFilter } from '@rules/card-query';
import { validCardFilter } from '@rules/card-filter-validation';
import { validEffectScope, scopeMatches } from '@engine/effect-scopes';
import { CardCharacteristicService as characteristics } from '@engine/card-characteristic-service';
import { resolutionChoice } from '@engine/resolution-choices';
import { targetOptions } from '@engine/choices';
import { buildStackEffects } from '@engine/effect-resolver';
import { gameReducer } from '@engine/game-reducer';
import { GameEngine } from '@engine/game-engine';
import { ActionValidator } from '@engine/action-validator';
import { instantiateCard } from '@library/card-factory';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import type { CardInstance, CardZone } from '@shared/card.types';
import type { CardFilter } from '@shared/card-query.types';
import type { EffectDefinition, StackObject } from '@shared/effect.types';
import type { GameRoom } from '@shared/game.room.types';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));
function card(id: string, zone: CardZone, player = 'player1') {
  const c = instantiateCard(id);
  c.state = { ...c.state, ownerId: player, controllerId: player, zone, zoneRevision: 0, summoningSickness: false };
  return c;
}
function put(room: GameRoom, c: CardInstance) {
  const p = room.players[c.state.ownerId];
  switch (c.state.zone) {
    case 'battlefield': room.battlefield.push(c); break;
    case 'hand': p.hand.push(c); break;
    case 'library': p.deck.push(c); break;
    case 'graveyard': p.graveyard.push(c); break;
    case 'exile': (p.exile ??= []).push(c); break;
    case 'stack': room.stack.push({ uuid: c.uuid + '-spell', type: 'spell', source: c, controllerId: c.state.controllerId, effects: [], countered: false }); break;
  }
}
function search(room: GameRoom, zone: CardZone, filter: CardFilter = {}, extras = {}) {
  const source = card('worlds-traveler', 'battlefield');
  const definition: EffectDefinition = { action: 'MOVE_ZONE', params: { origin: zone, destination: 'hand' }, targeting: { type: 'self', required: false },
    choice: { kind: 'search', zone, ...filter, ...extras } };
  const effects = buildStackEffects([definition], 'player1', source);
  const stack: StackObject = { uuid: 'query', type: 'triggered', source, controllerId: 'player1', effects, countered: false };
  return resolutionChoice(room, stack, effects[0], 0, []);
}
function ids(choice: ReturnType<typeof search>) {
  if (choice.kind === 'number') throw new Error('Expected listed choice');
  return choice.options.map(o => (o.value as { cardUuid: string }).cardUuid);
}

describe('one structural filter across card zones', () => {
  it.each<CardZone>(['library', 'hand', 'graveyard', 'exile', 'battlefield', 'stack'])('search, targeting and scope agree for %s', zone => {
    const room = createTestRoom(); room.players.player1.hand = [];
    const yes = card('phantom-land-soldier', zone), wrongColor = card('empire-servant', zone), wrongType = card('phantom-castle', zone), opponent = card('phantom-land-soldier', zone, 'player2');
    [yes, wrongColor, wrongType, opponent].forEach(c => put(room, c));
    const filter: CardFilter = { cardTypes: ['Creature'], colors: ['black'], controller: 'self' };
    expect(ids(search(room, zone, filter))).toEqual([yes.uuid]);
    expect(targetOptions(room, 'player1', yes, { ...filter, type: 'card', zones: [zone], required: true }).map(o => (o.value as { cardUuid: string }).cardUuid)).toEqual([yes.uuid]);
    expect(collectCards(room, { zones: [zone] }).filter(c => scopeMatches({ ...filter, zones: [zone] }, c, characteristics.resolve(room, c), yes, 'player1')).map(c => c.uuid)).toEqual([yes.uuid]);
    expect(ActionValidator.canMeetCondition(room, 'player1', { zoneCheck: { zone: [zone], ownedBy: 'self', filter, cardId: yes.blueprint.id } })).toBe(true);
    expect(ActionValidator.canMeetCondition(room, 'player1', { zoneCheck: { zone: [zone], ownedBy: 'self', filter, minCount: 2 } })).toBe(false);
  });

  it('uses live color, type, name, control and stats rather than only the blueprint', () => {
    let room = createTestRoom(); room.players.player1.hand = [];
    const c = card('empire-servant', 'battlefield', 'player2'); put(room, c);
    for (const effect of [{ type: 'COPY' as const, blueprint: { ...c.blueprint, name: '變更後的僕從' } }, { type: 'COLOR' as const, set: ['black' as const] }, { type: 'TYPE' as const, setSubTypes: ['幻影木偶'] }, { type: 'SET_STATS' as const, power: 4, toughness: 6 }, { type: 'CONTROL' as const, controllerId: 'player1' }]) {
      room = gameReducer(room, { type: 'ADD_CONTINUOUS_EFFECT', entry: { source: 'global', layer: effect.type === 'COPY' ? 1 : effect.type === 'CONTROL' ? 2 : effect.type === 'TYPE' ? 4 : effect.type === 'COLOR' ? 5 : 7,
        effect, scope: { cardUuid: c.uuid }, duration: 'PERMANENT', requiredZone: null } });
    }
    const filter: CardFilter = { names: ['變更後的僕從'], colors: ['black'], subTypes: ['幻影木偶'], owner: 'opponent', controller: 'self', power: { min: 4, max: 4 }, toughness: { min: 6 } };
    const choice = search(room, 'battlefield', filter);
    expect(ids(choice)).toEqual([c.uuid]);
    if (choice.kind === 'number') throw new Error('Expected card choice');
    expect(choice.options[0].label).toBe('變更後的僕從');
    expect(ids(search(room, 'battlefield', { ...filter, power: { max: 3 } }))).toEqual([]);
    expect(targetOptions(room, 'player1', c, { ...filter, type: 'permanent', required: true })[0].label).toBe('變更後的僕從');
  });

  it('keeps zone ownership separate from card filters and does not expose other private zones by default', () => {
    const room = createTestRoom(); room.players.player1.hand = [];
    const own = card('phantom-land-soldier', 'hand'), other = card('phantom-land-soldier', 'hand', 'player2'); put(room, own); put(room, other);
    expect(ids(search(room, 'hand', { colors: ['black'] }))).toEqual([own.uuid]);
    expect(ids(search(room, 'hand', { owner: 'opponent' }))).toEqual([]);
    expect(ids(search(room, 'hand', { owner: 'opponent' }, { zonePlayer: 'opponent' }))).toEqual([other.uuid]);
    expect(ids(search(room, 'hand', {}, { zonePlayer: 'any' }))).toEqual([own.uuid, other.uuid]);
  });

  it('shares name, mana value, counter, negation and compound filters', () => {
    const room = createTestRoom(); room.players.player1.hand = [];
    const yes = card('wind-spirit-prophet', 'graveyard'), excluded = card('wind-beast-fox', 'graveyard'), other = card('heavenly-gate', 'graveyard');
    yes.state.counters.charge = 2; [yes, excluded, other].forEach(c => put(room, c));
    const filter: CardFilter = { allOf: [{ nameContains: '風靈' }, { manaValue: { max: 2 } }], excludedNames: ['風靈獸 舞狐'],
      counter: { type: 'charge', min: 1 }, anyOf: [{ colors: ['green'] }, { cardTypes: ['Land'] }], not: { colors: ['yellow'] } };
    expect(ids(search(room, 'graveyard', filter))).toEqual([yes.uuid]);
    expect(ids(search(room, 'graveyard', { names: ['天域之門'] }))).toEqual([other.uuid]);
    expect(validEffectScope({ ...filter, zones: ['graveyard'] })).toBe(true);
  });

  it('does not resolve variable mana costs as a guessed fixed mana value', () => {
    const c = card('worlds-traveler', 'hand'); c.blueprint = { ...c.blueprint, castRequirements: { allowedZones: ['hand'], cost: { mana: { generic: { numeric: { kind: 'binding', name: 'X' } } } } } };
    expect(matchesCardFilter(c, { ...c.blueprint, controllerId: 'player1' }, { manaValue: { max: 3 } }, 'player1')).toBe(false);
  });

  it('keeps reference bounds and order within a search window, excluding later incarnations', () => {
    const room = createTestRoom(); room.players.player1.hand = [];
    const a = card('phantom-land-soldier', 'library'), b = card('phantom-land-soldier', 'library'), deep = card('phantom-land-soldier', 'library');
    [deep, a, b].forEach(c => put(room, c));
    const refs = [{ cardUuid: b.uuid, zoneRevision: 0 }, { cardUuid: a.uuid, zoneRevision: 0 }];
    expect(ids(search(room, 'library', { colors: ['black'] }, { cardRefs: refs }))).toEqual([b.uuid, a.uuid]);
    a.state.zoneRevision = 2;
    expect(ids(search(room, 'library', { colors: ['black'] }, { cardRefs: refs }))).toEqual([b.uuid]);
    expect(search(room, 'library', { colors: ['black'] }, { cardRefs: refs, min: 2, max: 2 })).toMatchObject({ min: 1, max: 2 });
    expect(room.players.player1.deck.map(c => c.uuid)).toEqual([deep.uuid, a.uuid, b.uuid]);
    expect(collectCards(room, { zones: [] })).toEqual([]);
    expect(scopeMatches({ zones: [] }, a, characteristics.resolve(room, a), a, 'player1')).toBe(false);
  });

  it('search selection does not inherit targeting restrictions', () => {
    const room = createTestRoom(); room.players.player1.hand = [];
    const c = card('phantom-land-soldier', 'battlefield'); c.blueprint = { ...c.blueprint, keywords: ['Shroud'] }; put(room, c);
    expect(ids(search(room, 'battlefield', { colors: ['black'] }))).toEqual([c.uuid]);
    expect(targetOptions(room, 'player1', c, { type: 'permanent', required: true, colors: ['black'] })).toEqual([]);
  });

  it.each([{ colors: ['purple'] }, { anyOf: [{ unknown: true }] }, { power: { min: 3, max: 1 } }, { not: { nameContains: 12 } }, { zones: ['hand'] }])('rejects malformed structural filter %j', filter => {
    expect(validCardFilter(filter)).toBe(false);
  });
});

function game(id: string) {
  const room = createTestRoom(); fillTestLibraries(room, 12);
  const source = card(id, 'hand'); room.players.player1.hand = [source];
  const engine = new GameEngine(room); engine.initRoom(); engines.push(engine);
  return { engine, source };
}
function cast(engine: GameEngine, source: CardInstance) {
  expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: source.uuid }).success).toBe(true); engine.resolveTopOfStack(); engine.resolveTopOfStack();
}
function choose(engine: GameEngine, choices: string[]) {
  const c = engine.roomState.pendingChoice!; expect(c).toBeTruthy();
  expect(engine.executePlayerAction(c.playerId, 'choose', { choiceId: c.id, choices }).success).toBe(true);
}

describe('workbook cards unblocked by shared card queries', () => {
  it('sapper mills three first, then recovers any black creature, including a newly milled non-puppet', () => {
    const { engine, source } = game('phantom-sapper');
    const black = card('empire-servant', 'library'); black.blueprint = { ...black.blueprint, colors: ['black'], subTypes: ['Other'] };
    const artifact = card('phantom-castle', 'library'), red = card('empire-servant', 'library'), older = card('phantom-land-soldier', 'graveyard');
    engine.roomState.players.player1.deck.push(black, artifact, red); engine.roomState.players.player1.graveyard = [older];
    cast(engine, source);
    expect(engine.roomState.players.player1.graveyard.map(c => c.uuid)).toEqual([older.uuid, red.uuid, artifact.uuid, black.uuid]);
    expect(ids(engine.roomState.pendingChoice!)).toEqual([older.uuid, black.uuid]);
    expect(engine.executePlayerAction('player1', 'choose', { choiceId: engine.roomState.pendingChoice!.id, choices: [] }).success).toBe(false);
    choose(engine, [black.uuid]);
    expect(engine.roomState.players.player1.hand.map(c => c.uuid)).toEqual([black.uuid]);
  });

  it('sapper completes without a choice when no black creature exists after milling', () => {
    const { engine, source } = game('phantom-sapper'); cast(engine, source);
    expect(engine.roomState.pendingChoice).toBeNull(); expect(engine.roomState.stack).toHaveLength(0);
    expect(engine.roomState.players.player1.graveyard).toHaveLength(3);
  });

  it.each([
    ['worlds-wind-envoy', 'worlds-traveler'],
    ['heavenly-land-envoy-reila', 'thunder-tundra'],
    ['wind-spirit-prophet', 'wind-beast-fox'],
    ['heavenly-seeker-yela', 'heavenly-gate'],
    ['heavenly-seeker-yela', 'winged-envoy'],
  ])('%s takes an eligible %s from the top three and orders only the remainder', (id, matchId) => {
    const { engine, source } = game(id); const match = card(matchId, 'library');
    // A yellow land here is explicit; thunder-tundra is multi-color and remains eligible through yellow.
    const no = card('empire-servant', 'library'), no2 = card(id, 'library'), deep = card(matchId, 'library');
    engine.roomState.players.player1.deck = [deep, no, no2, match]; cast(engine, source);
    expect(ids(engine.roomState.pendingChoice!)).toContain(match.uuid);
    expect(ids(engine.roomState.pendingChoice!)).not.toContain(deep.uuid);
    expect(engine.executePlayerAction('player1', 'choose', { choiceId: engine.roomState.pendingChoice!.id, choices: [] }).success).toBe(false);
    choose(engine, [match.uuid]);
    expect(ids(engine.roomState.pendingChoice!)).toEqual([no2.uuid, no.uuid]); choose(engine, [no.uuid, no2.uuid]);
    expect(engine.roomState.players.player1.hand.map(c => c.uuid)).toEqual([match.uuid]);
    expect(engine.roomState.players.player1.deck.map(c => c.uuid)).toEqual([no2.uuid, no.uuid, deep.uuid]);
    expect(engine.roomState.pendingChoice).toBeNull();
  });

  it('Yela excludes herself, equipment, wrong-color relics and wrong-tribe creatures', () => {
    const { engine, source } = game('heavenly-seeker-yela');
    engine.roomState.players.player1.deck = [card('heavenly-seeker-yela', 'library'), card('heavenly-lance', 'library'), card('phantom-castle', 'library')];
    cast(engine, source);
    expect(engine.roomState.pendingChoice?.kind).toBe('ordering');
    choose(engine, ids(engine.roomState.pendingChoice!)); expect(engine.roomState.players.player1.hand).toHaveLength(0);
  });
});
