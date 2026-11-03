import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { buildStackEffects, planStackResolution } from '@engine/effect-resolver';
import { parseCardDefinition, parseModifierDefinition } from '@card-game/engine/rules/parse';
import { collectCardSource } from '@rules/card-collections';
import { roomCards } from '@engine/continuous-effect-state';
import { createBoardNumericContext } from '@engine/numeric-characteristics';
import { CardCharacteristicService } from '@engine/card-characteristic-service';
import { evaluateNumericValue } from '@rules/numeric-values';
import { buildPlayerView } from '@server/projection/view-builder';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';
import type { CardInstance } from '@shared/card.types';
import type { ResolutionCardResults } from '@shared/resolution-result.types';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));
const self = { type: 'self', required: false };
const mill = (name = 'milled', amount = 3) => ({ family: 'cards', operation: 'mill', params: { amount }, targeting: self, recordResult: { name, kind: 'milled' } });
const count = (view: 'current' | 'recorded' = 'recorded', extra = {}) => ({ numeric: { kind: 'query', id: 'count', args: {
  scope: { from: { kind: 'result', name: 'milled', view }, zones: ['graveyard'], cardTypes: ['Creature'], ...extra },
} } });
const life = (amount: unknown, extra = {}) => ({ family: 'resources', operation: 'adjust_life', params: { amount }, targeting: self, ...extra });
const recover = (extra = {}) => ({ family: 'cards', operation: 'move', params: { origin: 'graveyard', destination: 'hand' }, targeting: self,
  choice: { kind: 'search', zone: 'graveyard', from: { kind: 'result', name: 'milled' }, cardTypes: ['Creature'], colors: ['black'], min: 1, max: 1, ...extra } });
function card(id: string, type = 'Creature'): CardInstance {
  const c = creature(id, 'player1'); c.state.zone = 'library';
  c.blueprint = { ...c.blueprint, cardTypes: [type], colors: ['black'] }; return c;
}
function setup(effects: unknown[], deck = [card('a'), card('b'), card('c', 'Artifact')]) {
  const blueprint = parseCardDefinition({ schemaVersion: 1, id: 'result-fixture', onCastEffects: effects });
  const source = creature('source', 'player1'), room = createTestRoom({ battlefield: [source] }); fillTestLibraries(room, 12);
  room.players.player1.deck = deck; room.players.player1.hand = [];
  const engine = new GameEngine(room); engine.initRoom(); engines.push(engine);
  engine.applyMutations([{ type: 'PUSH_STACK', stackObject: { type: 'triggered', uuid: 'resolution', source, controllerId: 'player1', countered: false,
    effects: buildStackEffects(blueprint.onCastEffects, 'player1', source) } }]);
  return engine;
}
function resolve(engine: GameEngine) { expect(engine.resolveTopOfStack().success).toBe(true); }
function choose(engine: GameEngine, ids: string[]) {
  const c = engine.roomState.pendingChoice!;
  expect(engine.executePlayerAction(c.playerId, 'choose', { choiceId: c.id, choices: ids }).success).toBe(true);
}
function resultSets(engine: GameEngine): ResolutionCardResults {
  const c = engine.roomState.pendingChoice!;
  if (c.continuation.type !== 'resolution') throw new Error('Expected a resolution choice');
  return c.continuation.stackObj.resolutionResults!;
}

describe('resolution-local mill collections', () => {
  it('moves cards immediately, filters only this mill, and retains recorded counts after recovery', () => {
    const engine = setup([mill(), life(count()), recover(), life(count()), life(count('current'))]);
    const older = card('older'); older.state.zone = 'graveyard'; engine.roomState.players.player1.graveyard.push(older);
    resolve(engine);
    expect(engine.roomState.players.player1.deck).toHaveLength(0);
    expect(engine.roomState.players.player1.graveyard.map(c => c.uuid)).toEqual(['older', 'c', 'b', 'a']);
    expect(engine.roomState.players.player1.life).toBe(22);
    expect(engine.roomState.pendingChoice!.options.map(o => o.id)).toEqual(['b', 'a']);
    expect(resultSets(engine).milled.cards.map(c => c.after?.card.state.zone)).toEqual(['graveyard', 'graveyard', 'graveyard']);
    expect(roomCards(engine.roomState).filter(c => c.uuid === 'a')).toHaveLength(1);
    choose(engine, ['a']);
    expect(engine.roomState.players.player1.life).toBe(25);
    expect(engine.roomState.players.player1.hand.map(c => c.uuid)).toEqual(['a']);
    expect(engine.roomState.stack).toHaveLength(0); expect(engine.roomState.pendingChoice).toBeNull();
    expect(JSON.stringify(engine.roomState)).not.toContain('"resolutionResults"');
    const completion = engine.drainEventBatches().flatMap(batch => batch.events).filter(event => ['STACK_ITEM_RESOLVED', 'STACK_RESOLVED', 'ACTION_RESOLVED'].includes(event.eventId));
    expect(completion.length).toBeGreaterThan(0);
    expect(JSON.stringify(completion)).not.toContain('"resolutionResults"');
  });
  it('survives engine reconstruction while awaiting a card choice', () => {
    const engine = setup([mill(), recover(), life(count())]); resolve(engine);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState))); restored.initRoom(); engines.push(restored);
    expect(resultSets(restored).milled.cards).toHaveLength(3);
    choose(restored, ['b']); expect(restored.roomState.players.player1.life).toBe(22);
    expect(restored.roomState.players.player1.hand.map(c => c.uuid)).toEqual(['b']);
    expect(JSON.stringify(restored.roomState)).not.toContain('"resolutionResults"');
  });
  it.each([true, false])('captures actual arrivals across a serialized replacement decision (redirect=%s)', redirect => {
    const engine = setup([mill(), life(count()), recover()]);
    engine.roomState.replacementEffects = [{ id: 'redirect', label: 'Exile a instead', match: { kinds: ['discard'], card: { cardUuid: 'a', zoneRevision: 0 } },
      operation: { type: 'move_destination', to: 'exile' }, optional: true }];
    resolve(engine); expect(engine.roomState.pendingChoice!.continuation.type).toBe('replacement');
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState))); restored.initRoom(); engines.push(restored);
    choose(restored, [redirect ? 'redirect' : 'skip:redirect']);
    expect(restored.roomState.players.player1.life).toBe(redirect ? 21 : 22);
    expect(resultSets(restored).milled.cards.find(c => c.before.card.uuid === 'a')?.after?.card.state.zone).toBe(redirect ? 'exile' : 'graveyard');
    expect(restored.roomState.pendingChoice!.options.map(o => o.id)).toEqual(redirect ? ['b'] : ['b', 'a']);
    choose(restored, ['b']); expect(restored.roomState.pendingChoice).toBeNull();
  });
  it('excludes a cancelled move from the recorded arrivals', () => {
    const engine = setup([mill(), life(count()), recover()]);
    engine.roomState.replacementEffects = [{ id: 'cancel', label: 'Keep a in library', match: { kinds: ['discard'], card: { cardUuid: 'a', zoneRevision: 0 } }, operation: { type: 'cancel_event' } }];
    resolve(engine); expect(engine.roomState.players.player1.life).toBe(21);
    expect(resultSets(engine).milled.cards.find(c => c.before.card.uuid === 'a')?.after).toBeUndefined();
    expect(engine.roomState.players.player1.deck.map(c => c.uuid)).toEqual(['a']);
    expect(engine.roomState.pendingChoice!.options.map(o => o.id)).toEqual(['b']);
  });
  it('retains the capture probe through multiple replacement pauses', () => {
    const engine = setup([mill(), life(count()), recover()]);
    engine.roomState.replacementEffects = ['a', 'b'].map(id => ({ id: 'exile-' + id, label: 'Exile ' + id, match: { kinds: ['discard'], card: { cardUuid: id, zoneRevision: 0 } },
      operation: { type: 'move_destination', to: 'exile' }, optional: true }));
    resolve(engine);
    engine.roomState.pendingChoice = JSON.parse(JSON.stringify(engine.roomState.pendingChoice)); choose(engine, ['skip:exile-b']);
    expect(engine.roomState.pendingChoice!.continuation.type).toBe('replacement');
    engine.roomState.pendingChoice = JSON.parse(JSON.stringify(engine.roomState.pendingChoice)); choose(engine, ['exile-a']);
    expect(engine.roomState.players.player1.life).toBe(21);
    expect(resultSets(engine).milled.cards.map(entry => entry.after?.card.state.zone)).toEqual(['graveyard', 'graveyard', 'exile']);
    choose(engine, ['b']); expect(engine.roomState.pendingChoice).toBeNull();
  });
  it('does not re-admit a card that leaves and returns or add unrelated later graveyard cards', () => {
    const engine = setup([mill(), recover()]); resolve(engine);
    const results = resultSets(engine);
    engine.applyMutations([{ type: 'MOVE_CARD', cardUuid: 'a', playerId: 'player1', from: 'graveyard', to: 'hand' },
      { type: 'MOVE_CARD', cardUuid: 'a', playerId: 'player1', from: 'hand', to: 'graveyard' }]);
    const late = card('late'); late.state.zone = 'graveyard'; engine.roomState.players.player1.graveyard.push(late);
    expect(collectCardSource(roomCards(engine.roomState), { kind: 'result', name: 'milled' }, results)?.map(e => e.card.uuid)).toEqual(['c', 'b']);
    expect(collectCardSource(roomCards(engine.roomState), { kind: 'result', name: 'milled', view: 'recorded' }, results)?.map(e => e.card.uuid)).toEqual(['c', 'b', 'a']);
  });
  it('keeps successive mills separate even when their cards share one graveyard', () => {
    const engine = setup([mill('milled', 1), mill('second', 2), recover()], ['a', 'b', 'c', 'd'].map(id => card(id)));
    resolve(engine);
    expect(engine.roomState.pendingChoice!.options.map(o => o.id)).toEqual(['d']);
    expect(resultSets(engine).milled.cards.map(e => e.after?.card.uuid)).toEqual(['d']);
    expect(resultSets(engine).second.cards.map(e => e.after?.card.uuid)).toEqual(['c', 'b']);
  });
  it('rejects duplicate result names without mutating the input room', () => {
    const engine = setup([mill(), mill()]);
    expect(() => planStackResolution(engine.roomState, engine.roomState.stack[0])).toThrow('Duplicate resolution result');
    expect(engine.roomState.players.player1.deck).toHaveLength(3);
    expect(engine.roomState.players.player1.graveyard).toHaveLength(0);
  });
  it('uses immutable recorded characteristics while current queries use live characteristics', () => {
    const engine = setup([mill(), recover()]); resolve(engine); const results = resultSets(engine);
    const current = engine.roomState.players.player1.graveyard.find(c => c.uuid === 'a')!;
    current.blueprint = { ...current.blueprint, cardTypes: ['Artifact'] };
    const numeric = createBoardNumericContext({ cards: roomCards(engine.roomState), results, characteristics: c => CardCharacteristicService.resolve(engine.roomState, c) });
    expect(evaluateNumericValue(count(), numeric)).toEqual({ ok: true, value: 2 });
    expect(evaluateNumericValue(count('current'), numeric)).toEqual({ ok: true, value: 1 });
    const query = (id: string, view: 'current' | 'recorded', extra = {}) => ({ numeric: { kind: 'query', id, args: {
      scope: { from: { kind: 'result', name: 'milled', view }, ids: ['a'], ...(id === 'exists' ? { cardTypes: ['Creature'] } : {}) }, ...extra,
    } } });
    expect(evaluateNumericValue(query('exists', 'recorded'), numeric)).toEqual({ ok: true, value: 1 });
    expect(evaluateNumericValue(query('exists', 'current'), numeric)).toEqual({ ok: true, value: 0 });
    current.state.counters.memory = 2;
    expect(evaluateNumericValue(query('counterTotal', 'recorded', { counterType: 'memory' }), numeric)).toEqual({ ok: true, value: 0 });
    expect(evaluateNumericValue(query('counterTotal', 'current', { counterType: 'memory' }), numeric)).toEqual({ ok: true, value: 2 });
  });
  it.each([0, 1, 5])('records only actual cards when the library contains %s cards', size => {
    const engine = setup([mill(), life(count())], Array.from({ length: size }, (_, i) => card('card-' + i)));
    resolve(engine); expect(engine.roomState.players.player1.life).toBe(20 + Math.min(size, 3));
    expect(engine.roomState.players.player1.graveyard).toHaveLength(Math.min(size, 3));
    expect(engine.roomState.players.player1.failedDraw).not.toBe(true);
  });
  it('supports conditions over a result and normal contextual fields', () => {
    const engine = setup([mill(), life(7, { condition: { all: [
      { op: 'gt', left: count(), right: 0 }, { op: 'eq', left: { path: 'controller.life' }, right: 20 },
    ] } }), life(99, { condition: { op: 'eq', left: count(), right: 0 } })]);
    resolve(engine); expect(engine.roomState.players.player1.life).toBe(27);
  });
  it('fails closed for a missing result and never searches the whole graveyard instead', () => {
    const engine = setup([life(count()), recover()]);
    const older = card('older'); older.state.zone = 'graveyard'; engine.roomState.players.player1.graveyard.push(older);
    resolve(engine); expect(engine.roomState.players.player1.life).toBe(20); expect(engine.roomState.pendingChoice).toBeNull();
    expect(engine.roomState.players.player1.hand).toHaveLength(0);
  });
  it('isolates equally named results between different stack objects and clears completion reports', () => {
    const engine = setup([mill(), recover()]); resolve(engine);
    const other = { ...engine.roomState.stack[0], uuid: 'other', effects: buildStackEffects(parseCardDefinition({ schemaVersion: 1, id: 'other', onCastEffects: [life(count())] }).onCastEffects, 'player1') };
    const plan = planStackResolution(engine.roomState, other);
    expect(plan.mutations.some(m => m.type === 'CHANGE_LIFE')).toBe(false);
    expect(plan.resolution!.stackObj.resolutionResults).toBeUndefined();
  });
  it('can record an opponent mill and select from that player’s graveyard', () => {
    const engine = setup([{ ...mill(), targeting: { type: 'player', required: false, all: true, controller: 'opponent' } },
      recover({ zonePlayer: 'opponent' })]);
    const enemy = card('enemy'); enemy.state.ownerId = enemy.state.controllerId = 'player2';
    engine.roomState.players.player2.deck = [enemy]; resolve(engine);
    expect(engine.roomState.players.player2.graveyard.map(c => c.uuid)).toEqual(['enemy']);
    expect(engine.roomState.pendingChoice!.options.map(o => o.id)).toEqual(['enemy']);
    expect(resultSets(engine).milled.cards[0].after?.card.state.ownerId).toBe('player2');
  });
  it('does not execute capture on countered objects and clears incoming temporary data', () => {
    const engine = setup([mill(), recover()]);
    const object = { ...engine.roomState.stack[0], countered: true, resolutionResults: { old: { name: 'old', kind: 'milled' as const, cards: [] } } };
    const plan = planStackResolution(engine.roomState, object);
    expect(plan.mutations.filter(m => m.type === 'MOVE_CARD')).toHaveLength(0);
    expect(plan.resolution!.stackObj.resolutionResults).toBeUndefined();
  });
  it('does not expose internal sets or recorded snapshots in player projections', () => {
    const engine = setup([mill(), recover()]); resolve(engine);
    for (const viewer of ['player1', 'player2']) expect(JSON.stringify(buildPlayerView(engine.roomState, viewer))).not.toContain('"resolutionResults"');
  });
  it('rejects result capture on other operations, recorded-card choices and persistent result dependencies', () => {
    const parse = (instruction: unknown) => parseCardDefinition({ schemaVersion: 1, id: 'invalid', onCastEffects: [instruction] });
    expect(() => parse({ ...life(1), recordResult: { name: 'milled', kind: 'milled' } })).toThrow();
    expect(() => parse(recover({ from: { kind: 'result', name: 'milled', view: 'recorded' } }))).toThrow();
    expect(() => parse(mill('__proto__'))).toThrow();
    expect(() => parseModifierDefinition({ id: 'bad', family: 'characteristics', scope: { self: true }, operation: { type: 'STAT_DELTA', power: count() } })).toThrow();
    expect(() => parse({ family: 'characteristics', operation: 'create_effect', params: { effect: { type: 'STAT_DELTA', power: count() } } })).toThrow();
  });
});
