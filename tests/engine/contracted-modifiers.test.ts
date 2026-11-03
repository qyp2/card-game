import { afterEach, describe, expect, it } from 'vitest';
import { parseCardDefinition } from '@card-game/engine/rules/parse';
import { GameEngine } from '@engine/game-engine';
import { CardCharacteristicService as service } from '@engine/card-characteristic-service';
import { OptionService } from '@engine/option-service';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';
import { instantiateCard } from '@library/card-factory';
import { planDamage } from '@engine/damage-service';
import { planProposedMutations } from '@engine/proposed-events';
import { gameReducer } from '@engine/game-reducer';
import { captureSourceInformation } from '@engine/source-information';
import type { CardInstance } from '@shared/card.types';
import type { GameRoom } from '@shared/game.room.types';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(e => e.dispose()));
function defined(id: string, extra: Record<string, unknown>): CardInstance {
  const blueprint = parseCardDefinition({ schemaVersion: 1, id, name: id, cardTypes: ['Artifact'], ...extra });
  return { ...creature(id, 'player1'), blueprint };
}
function aura(rules: unknown[], extra = {}) { return defined('aura', { abilities: [{ id: 'passive', type: 'static', rules }], ...extra }); }
function start(source: CardInstance) {
  const room = createTestRoom(); fillTestLibraries(room, 12); room.players.player1.hand = []; room.battlefield = [source];
  const engine = new GameEngine(room); engine.initRoom(); engines.push(engine); return engine;
}
function payable(engine: GameEngine, id = 'payable', extra = {}) {
  const c = defined(id, { cardTypes: ['Creature'], manaCost: '{2}{R}', power: 2, toughness: 3, ...extra });
  c.state.zone = 'hand'; engine.roomState.players.player1.hand.push(c); return c;
}
const cast = (engine: GameEngine, c: CardInstance) => engine.executePlayerAction('player1', 'cast_spell', { cardUuid: c.uuid });
function emptyMana(room: GameRoom) { room.players.player1.mana = { red: 0, green: 0, blue: 0, white: 0, yellow: 0, black: 0 }; }
function damage(engine: GameEngine, victim: CardInstance, amount: number, preventable = true) {
  const source = creature('damage-source', 'player2');
  engine.applyMutations(planDamage(engine.roomState, [{ source: captureSourceInformation(engine.roomState, source), recipient: { kind: 'permanent', cardUuid: victim.uuid,
    zoneRevision: victim.state.zoneRevision ?? 0 }, amount, combat: false, preventable }]));
}
const costRule = (operation: unknown, extra = {}) => ({ id: 'discount', family: 'costs', action: 'cast', scope: { cardTypes: ['Creature'], controller: 'self' }, operation, ...extra });

describe('contracted characteristic and permission modifiers', () => {
  it('activates a conditional stat modifier from current player state and removes it with its source', () => {
    const source = aura([{ id: 'healthy', family: 'characteristics', scope: { cardTypes: ['Creature'], controller: 'self' },
      condition: { op: 'gte', left: { path: 'controller.life' }, right: 21 }, operation: { type: 'STAT_DELTA', power: 2, toughness: 2 } }]);
    const engine = start(source), target = creature('target', 'player1', 2, 5); engine.roomState.battlefield.push(target);
    expect(service.resolvePower(engine.roomState, target)).toBe(2);
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 21 }]); expect(service.resolvePower(engine.roomState, target)).toBe(4);
    engine.applyMutations([{ type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' }]);
    expect(service.resolvePower(engine.roomState, target)).toBe(2);
  });
  it('recomputes a persistent count-based bonus without mutating printed values', () => {
    const count = { numeric: { kind: 'query', id: 'count', args: { scope: { zones: ['graveyard'], cardTypes: ['Creature'], controller: 'self' } } } };
    const source = aura([{ id: 'growing', family: 'characteristics', scope: { self: true }, operation: { type: 'STAT_DELTA', power: count, toughness: count } }], { cardTypes: ['Creature'], power: 1, toughness: 3 });
    const engine = start(source), dead = creature('dead', 'player1'); dead.state.zone = 'graveyard'; engine.roomState.players.player1.graveyard.push(dead);
    expect(service.resolvePower(engine.roomState, source)).toBe(2);
    engine.roomState.players.player1.graveyard.push({ ...creature('dead-two', 'player1'), state: { ...dead.state } });
    expect(service.resolvePower(engine.roomState, source)).toBe(3); expect(source.blueprint.power).toBe(1);
  });
  it('uses the same condition and scope contract for a casting prohibition', () => {
    const source = aura([{ id: 'ban', family: 'permissions', scope: { cardTypes: ['Creature'], zones: ['hand'], controller: 'self' },
      condition: { op: 'lt', left: { path: 'controller.life' }, right: 20 }, operation: { type: 'PERMISSION', rules: [{ action: 'cast', mode: 'prohibit', players: 'self' }] } }]);
    const engine = start(source), c = payable(engine);
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 19 }]); expect(cast(engine, c).success).toBe(false);
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 20 }]); expect(cast(engine, c).success).toBe(true);
  });
});

describe('contracted cast-cost modifiers', () => {
  it('prices base waivers before additional costs, taxes and reductions, preserving non-mana costs', () => {
    const source = aura([costRule({ type: 'mana.waive_base' }), { ...costRule({ type: 'mana.increase', color: 'generic', amount: 3 }), id: 'tax' },
      { ...costRule({ type: 'mana.reduce', color: 'generic', amount: 1 }), id: 'reduce' }]);
    const engine = start(source), c = payable(engine, 'taxed', { castRequirements: { additionalCost: { mana: { generic: 1 }, life: 2 } } });
    engine.roomState.players.player1.mana = { red: 0, green: 0, blue: 3, white: 0, yellow: 0, black: 0 };
    expect(cast(engine, c).success).toBe(true); expect(engine.roomState.players.player1.mana.blue).toBe(0); expect(engine.roomState.players.player1.life).toBe(18);
  });
  it('clamps reductions at zero without spending or removing colored requirements', () => {
    const engine = start(aura([costRule({ type: 'mana.reduce', color: 'generic', amount: 99 })])), c = payable(engine);
    emptyMana(engine.roomState); expect(cast(engine, c).success).toBe(false);
    engine.roomState.players.player1.mana.red = 1; expect(cast(engine, c).success).toBe(true);
    expect(engine.roomState.players.player1.mana.red).toBe(0);
  });
  it('supports first-cast history and previews without consuming usage', () => {
    const engine = start(aura([costRule({ type: 'mana.waive_base' }, { condition: { op: 'eq', left: { path: 'history.own.SPELL_CAST' }, right: 0 },
      usage: { period: 'turn', limit: 1, identity: 'source_incarnation', consume: 'on_commit' } })]));
    emptyMana(engine.roomState); const first = payable(engine), second = payable(engine, 'second');
    expect(new OptionService().getOptions(engine.roomState, 'player1', first.uuid, 'hand').find(o => o.actionId === 'cast_spell')?.disabled).toBe(false);
    expect(engine.roomState.turnHistory?.uses ?? {}).toEqual({});
    expect(cast(engine, first).success).toBe(true); engine.resolveTopOfStack(); expect(cast(engine, second).success).toBe(false);
    expect(Object.values(engine.roomState.turnHistory!.uses)).toContain(1);
    engine.applyMutations([{ type: 'SET_TURN', playerId: 'player1', advance: true }]); expect(cast(engine, second).success).toBe(true);
  });
  it('does not consume a benefit when payment fails', () => {
    const engine = start(aura([costRule({ type: 'mana.reduce', color: 'generic', amount: 1 }, { usage: { period: 'game', limit: 1, identity: 'source_card', consume: 'on_commit' } })]));
    const c = payable(engine); emptyMana(engine.roomState); expect(cast(engine, c).success).toBe(false); expect(engine.roomState.gameRuleUses).toBeUndefined();
    engine.roomState.players.player1.mana = { red: 1, green: 1, blue: 0, white: 0, yellow: 0, black: 0 }; expect(cast(engine, c).success).toBe(true);
    expect(Object.values(engine.roomState.gameRuleUses!)).toEqual([1]);
  });
  it.each(['source_card', 'source_incarnation'] as const)('keeps explicit per-game identity semantics across source reentry (%s)', identity => {
    const source = aura([costRule({ type: 'mana.waive_base' }, { usage: { period: 'game', limit: 1, identity, consume: 'on_commit' } })]);
    const engine = start(source); emptyMana(engine.roomState); const first = payable(engine), next = payable(engine, 'next');
    expect(cast(engine, first).success).toBe(true); engine.resolveTopOfStack();
    engine.applyMutations([{ type: 'SET_TURN', playerId: 'player1', advance: true }, { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' },
      { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'graveyard', to: 'battlefield' }]);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState))); restored.initRoom(); engines.push(restored);
    expect(cast(restored, next).success).toBe(identity === 'source_incarnation');
  });
});

describe('contracted passive event replacements', () => {
  const rule = (extra = {}) => ({ id: 'shield', family: 'event-replacements', events: ['damage'], scope: { type: 'card', filter: { cardTypes: ['Creature'], subTypes: ['冰龍'], counter: { type: 'aurora', min: 1 }, controller: 'self' } },
    operation: { type: 'prevent_damage', amount: 1 }, ...extra });
  function fixture(extra = {}) {
    const source = aura([rule(extra)]), engine = start(source), target = creature('ice', 'player1', 2, 30);
    target.blueprint = { ...target.blueprint, subTypes: ['冰龍'] }; target.state.counters.aurora = 1; engine.roomState.battlefield.push(target);
    return { engine, source, target };
  }
  it('checks recipient filters on every damage event and stops when the counter or source leaves', () => {
    const { engine, source, target } = fixture(); damage(engine, target, 4); expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(3);
    engine.applyMutations([{ type: 'REMOVE_COUNTER', cardUuid: target.uuid, counterType: 'aurora', amount: 1 }]); damage(engine, target, 4);
    expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(7);
    engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: target.uuid, counterType: 'aurora', amount: 1 }, { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' }]);
    damage(engine, target, 4); expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(11);
  });
  it('shares per-turn usage and does not spend prevention on unpreventable damage', () => {
    const { engine, target } = fixture({ operation: { type: 'prevent_damage', amount: 3 }, usage: { period: 'turn', limit: 1, identity: 'source_incarnation', consume: 'on_change' } });
    damage(engine, target, 4, false); expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(4);
    damage(engine, target, 4); expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(5);
    damage(engine, target, 4); expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(9);
    engine.applyMutations([{ type: 'SET_TURN', playerId: 'player1', advance: true }]); damage(engine, target, 4);
    expect(engine.roomState.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(10);
  });
  it.each(['turn', 'game'] as const)('shares %s usage across simultaneous damage assignments', period => {
    const { engine, target } = fixture({ operation: { type: 'prevent_damage', amount: 3 }, usage: { period, limit: 1, identity: 'source_card', consume: 'on_change' } });
    const room = engine.roomState, attacker = creature('attacker', 'player2');
    const assignment = { source: captureSourceInformation(room, attacker), recipient: { kind: 'permanent' as const, cardUuid: target.uuid,
      zoneRevision: target.state.zoneRevision ?? 0 }, amount: 4, combat: true };
    const plan = planProposedMutations(room, planDamage(room, [assignment, assignment]), { simultaneous: true });
    expect(plan.pendingChoice).toBeUndefined();
    const result = plan.mutations.reduce(gameReducer, room);
    expect(result.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(5);
    expect(Object.values(period === 'game' ? result.gameRuleUses! : result.turnHistory!.uses)).toEqual([1]);
    expect(room.battlefield.find(c => c.uuid === target.uuid)?.state.damageTaken).toBe(0);
  });
});
