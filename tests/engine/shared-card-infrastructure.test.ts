import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { CardCharacteristicService as values } from '@engine/card-characteristic-service';
import { gameReducer } from '@engine/game-reducer';
import { abilityLimitReached } from '@engine/turn-history';
import { parseCardDefinition } from '@library/card-parser';
import { instantiateCard } from '@library/card-factory';
import { matchesCardFilter } from '../../packages/engine/src/shared/card-query';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(e => e.dispose()));
function engineWith(...cards: ReturnType<typeof creature>[]) {
  const room = createTestRoom(); fillTestLibraries(room, 8); room.battlefield = cards;
  const engine = new GameEngine(room); engine.initRoom(); engines.push(engine); return engine;
}
function cardFrom(raw: any, zone = 'battlefield') {
  const card = creature(raw.id, 'player1'); card.blueprint = parseCardDefinition({ schemaVersion: 1, name: raw.id,
    cardTypes: ['Creature'], power: 2, toughness: 4, ...raw }); card.state.zone = zone as any; return card;
}
const usage = { period: 'game', limit: 1, identity: 'source_card', consume: 'on_commit' };
const draw = { family: 'cards', operation: 'draw', params: { amount: 1 }, targeting: { type: 'self', required: false } };

describe('effective mana cost and real phantom consumers', () => {
  it('uses zero in every filter only while the graveyard, phase, controller and count conditions hold', () => {
    const room = createTestRoom(); room.phase = 'declareAttackersStep';
    const puppet = instantiateCard('phantom-puppet'); puppet.state = { ...puppet.state, ownerId: 'player1', controllerId: 'player1', zone: 'graveyard' };
    room.players.player1.graveyard = [puppet];
    room.battlefield = [0, 1, 2].map(i => { const c = creature('black' + i, 'player1'); c.blueprint = { ...c.blueprint, colors: ['black'] }; return c; });
    expect(values.resolveManaValue(room, puppet)).toBe(0);
    expect(matchesCardFilter(puppet, values.resolve(room, puppet), { manaValue: { max: 0 } })).toBe(true);
    expect(values.resolveManaValue({ ...room, phase: 'stateMainPhase' }, puppet)).toBe(1);
    expect(values.resolveManaValue({ ...room, activeTurnPlayerId: 'player2' }, puppet)).toBe(1);
    expect(values.resolveManaValue({ ...room, battlefield: room.battlefield.slice(1) }, puppet)).toBe(1);
    const hand = gameReducer(room, { type: 'MOVE_CARD', cardUuid: puppet.uuid, playerId: 'player1', from: 'graveyard', to: 'hand' });
    expect(values.resolveManaValue(hand, hand.players.player1.hand.at(-1)!)).toBe(1);
    expect(puppet.blueprint.castRequirements.cost?.mana?.black).toBe(1);
  });
  it('replaces the whole giant cost and restores its graveyard base after the condition ends', () => {
    const room = createTestRoom(); const giant = instantiateCard('phantom-giant');
    giant.state = { ...giant.state, ownerId: 'player1', controllerId: 'player1', zone: 'graveyard' }; room.players.player1.graveyard = [giant];
    expect(values.resolveManaCost(room, giant)).toEqual({ black: 3, generic: 1 });
    room.phase = 'declareAttackersStep'; room.battlefield = Array.from({ length: 5 }, (_, i) => { const c = creature('b' + i, 'player1'); c.blueprint = { ...c.blueprint, colors: ['black'] }; return c; });
    expect(values.resolveManaValue(room, giant)).toBe(0);
    room.battlefield.pop(); expect(values.resolveManaValue(room, giant)).toBe(4);
  });
  it('starts casting at the effective cost and applies payment tax once without changing mana-value queries', () => {
    const c = cardFrom({ id: 'effective-spell', cardTypes: ['Spell'], manaCost: '{5}', abilities: [{ id: 'value', type: 'static', activeZones: ['hand'], rules: [
      { id: 'zero', family: 'characteristics', scope: { self: true, zones: ['hand'] }, operation: { type: 'MANA_COST', mana: {} } },
      { id: 'tax', family: 'costs', action: 'cast', scope: { self: true, zones: ['hand'] }, operation: { type: 'mana.increase', color: 'generic', amount: 1 } },
    ] }] }, 'hand');
    const engine = engineWith(); engine.roomState.players.player1.hand = [c];
    engine.roomState.players.player1.mana = { red: 1, black: 0, blue: 0, white: 0, yellow: 0, green: 0 };
    expect(values.resolveManaValue(engine.roomState, c)).toBe(0);
    expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: c.uuid }).success).toBe(true);
    expect(engine.roomState.players.player1.mana.red).toBe(0);
  });
  it('the puppet attack can deploy the selected exact graveyard puppet, with no ordinary graveyard casting permission', () => {
    const puppet = instantiateCard('phantom-puppet'); puppet.state = { ...puppet.state, ownerId: 'player1', controllerId: 'player1', zone: 'battlefield', summoningSickness: false };
    const engine = engineWith(puppet); engine.roomState.phase = 'declareAttackersStep'; engine.roomState.priorityPlayerId = null;
    const target = instantiateCard('phantom-giant'); target.state = { ...target.state, ownerId: 'player1', controllerId: 'player1', zone: 'graveyard' }; engine.roomState.players.player1.graveyard = [target];
    expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: target.uuid }).success).toBe(false);
    expect(engine.executePlayerAction('player1', 'declare_attackers', { attackers: [{ cardUuid: puppet.uuid }] }).success).toBe(true);
    expect(engine.resolveTopOfStack().success).toBe(true);
    const choice = engine.roomState.pendingChoice!;
    expect(engine.executePlayerAction('player1', 'choose', { choiceId: choice.id, choices: [target.uuid] }).success).toBe(true);
    expect(engine.roomState.battlefield.some(c => c.uuid === target.uuid)).toBe(true);
  });
});

describe('ordinary ability game-period usage', () => {
  it('queries purely, consumes one committed activation, survives turns/zone changes/JSON and rejects a repeat', () => {
    const c = cardFrom({ id: 'once', abilities: [{ id: 'draw', type: 'activated', cost: {}, usage, effect: draw }] });
    const engine = engineWith(c); const ability: any = values.resolveAbilities(engine.roomState, c)[0];
    const before = JSON.stringify(engine.roomState);
    expect(abilityLimitReached(engine.roomState, c, ability)).toBe(false); expect(abilityLimitReached(engine.roomState, c, ability)).toBe(false);
    expect(JSON.stringify(engine.roomState)).toBe(before);
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: c.uuid, abilityId: 'draw' }).success).toBe(true);
    expect(Object.values(engine.roomState.gameRuleUses!)).toEqual([1]); engine.resolveTopOfStack();
    let restored = JSON.parse(JSON.stringify(engine.roomState));
    restored = gameReducer(restored, { type: 'SET_TURN', playerId: 'player1', advance: true });
    restored = gameReducer(restored, { type: 'MOVE_CARD', cardUuid: c.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' });
    restored = gameReducer(restored, { type: 'MOVE_CARD', cardUuid: c.uuid, playerId: 'player1', from: 'graveyard', to: 'battlefield' });
    expect(abilityLimitReached(restored, restored.battlefield[0], ability)).toBe(true);
    expect(abilityLimitReached(createTestRoom(), c, ability)).toBe(false);
  });
  it('reserves a single triggered use across simultaneous events and consumes even if later countered', () => {
    const c = cardFrom({ id: 'once-trigger', abilities: [{ id: 'counter-draw', type: 'triggered', triggerCondition: 'ON_COUNTER_CHANGED', usage, effect: draw }] });
    const engine = engineWith(c);
    engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: c.uuid, counterType: 'charge', amount: 1 }, { type: 'ADD_COUNTER', cardUuid: c.uuid, counterType: 'charge', amount: 1 }]);
    // Rules checkpoint flushes discovery when priority is requested.
    engine.givePriorityTo('player1');
    expect(engine.roomState.stack.filter(o => o.type === 'triggered')).toHaveLength(1);
    expect(Object.values(engine.roomState.gameRuleUses!)).toEqual([1]);
    engine.applyMutations([{ type: 'COUNTER_STACK', stackUuid: engine.roomState.stack[0].uuid }]);
    expect(abilityLimitReached(engine.roomState, c, values.resolveAbilities(engine.roomState, c)[0] as any)).toBe(true);
  });
  it('counts an immediate mana ability and does not consume on rejected payment', () => {
    const c = cardFrom({ id: 'once-mana', abilities: [{ id: 'mana', type: 'activated', usage, cost: { life: 21 }, effect: { family: 'resources', operation: 'add_mana', params: { color: 'black', amount: 1 }, targeting: { type: 'self', required: false } } }] });
    const engine = engineWith(c);
    expect(engine.executePlayerAction('player1', 'tapForMana', { cardUuid: c.uuid, abilityId: 'mana', manaColor: 'black', color: 'black' }).success).toBe(false);
    expect(engine.roomState.gameRuleUses).toBeUndefined();
    engine.roomState.players.player1.life = 30;
    expect(engine.executePlayerAction('player1', 'tapForMana', { cardUuid: c.uuid, abilityId: 'mana', manaColor: 'black', color: 'black' }).success).toBe(true);
    expect(Object.values(engine.roomState.gameRuleUses!)).toEqual([1]);
    expect(engine.executePlayerAction('player1', 'tapForMana', { cardUuid: c.uuid, abilityId: 'mana', manaColor: 'black', color: 'black' }).success).toBe(false);
  });
});


describe('shared ability usage identity', () => {
  it('shares a declared group between different abilities while keeping other physical copies independent', () => {
    const abilities = ['a', 'b'].map(id => ({ id, type: 'activated', cost: {}, usage: { ...usage, group: 'shared' }, effect: draw }));
    const a = cardFrom({ id: 'group', abilities }), b = cardFrom({ id: 'group-copy', abilities });
    const engine = engineWith(a, b);
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: a.uuid, abilityId: 'a' }).success).toBe(true);
    engine.resolveTopOfStack();
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: a.uuid, abilityId: 'b' }).success).toBe(false);
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: b.uuid, abilityId: 'b' }).success).toBe(true);
  });
});


describe('controller-wide usage groups', () => {
  it('shares an explicitly named controller budget across different definitions', () => {
    const ability = { id: 'a', type: 'activated', cost: {}, usage: { ...usage, identity: 'controller', group: 'one-special' }, effect: draw };
    const a = cardFrom({ id: 'first-definition', abilities: [ability] }), b = cardFrom({ id: 'different-definition', abilities: [ability] });
    const engine = engineWith(a, b);
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: a.uuid, abilityId: 'a' }).success).toBe(true);
    engine.resolveTopOfStack();
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: b.uuid, abilityId: 'a' }).success).toBe(false);
  });
});


describe('effective controller source snapshots', () => {
  it('captures the activating controller when a continuous control rule differs from base state', () => {
    const c = cardFrom({ id: 'controlled-mana', abilities: [
      { id: 'control', type: 'static', rules: [{ id: 'controller', family: 'characteristics', scope: { self: true }, operation: { type: 'CONTROL', controllerId: 'player2' } }] },
      { id: 'mana', type: 'activated', cost: {}, effect: { family: 'resources', operation: 'add_mana', params: { color: 'black', amount: 1 } } },
    ] });
    const engine = engineWith(c); engine.roomState.priorityPlayerId = 'player2';
    expect(engine.executePlayerAction('player2', 'tapForMana', { cardUuid: c.uuid, abilityId: 'mana', color: 'black' }).success).toBe(true);
    const applied = engine.drainEventBatches().flatMap(b => b.events).find(e => e.eventId === 'MUTATION_APPLIED' && e.payload.mutation.type === 'ADD_MANA')!;
    expect(applied.cause).toMatchObject({ controllerId: 'player2', source: { card: { uuid: c.uuid, state: { controllerId: 'player2' } } } });
  });
});
