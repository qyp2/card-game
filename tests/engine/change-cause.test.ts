import { afterEach, describe, expect, it } from 'vitest';
import { gameReducer } from '@engine/game-reducer';
import { GameEngine } from '@engine/game-engine';
import { parseCardDefinition } from '@library/card-parser';
import { captureSourceInformation } from '@engine/source-information';
import { planDamage } from '@engine/damage-service';
import { CardCharacteristicService } from '@engine/card-characteristic-service';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(e => e.dispose()));
const allOpponents = { type: 'permanent', controller: 'opponent', cardTypes: ['Creature'], all: true, required: false };
function setup(effects: any[], life = 2, extra: any = {}) {
  const room = createTestRoom(); fillTestLibraries(room, 8);
  const source = creature('cause-spell', 'player1'); source.state.zone = 'hand';
  source.blueprint = parseCardDefinition({ schemaVersion: 1, id: 'cause-spell', name: 'Cause test', cardTypes: ['Spell'], manaCost: '', onCastEffects: effects });
  const victim = creature('victim', 'player2', 1, life); room.battlefield = [victim]; room.players.player1.hand = [source];
  Object.assign(room, extra); const engine = new GameEngine(room); engine.initRoom(); engines.push(engine);
  expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: source.uuid }).success).toBe(true);
  return { engine, source, victim };
}
const shrink = (amount: number, rest: any = {}) => ({ family: 'characteristics', operation: 'create_effect', params: { effect: { type: 'STAT_DELTA', toughness: -amount }, duration: 'PERMANENT' }, targeting: allOpponents, ...rest });
const reward = { family: 'resources', operation: 'adjust_life', params: { amount: 2 }, targeting: { type: 'self', required: false }, requiresOutcome: 'kill' };
const killed = { name: 'kill', kind: 'killed' };
const events = (e: GameEngine) => e.drainEventBatches().flatMap(b => b.events);

describe('shared cause and attributed kill outcomes', () => {
  it('exiles a creature killed by the reduction directly, retains the spell source and gates the follow-up', () => {
    const { engine, source } = setup([shrink(2, { onKill: { destination: 'exile' }, recordOutcome: killed }), reward]);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(engine.roomState.players.player2.graveyard).toEqual([]);
    expect(engine.roomState.players.player2.exile?.map(c => c.uuid)).toEqual(['victim']);
    expect(engine.roomState.players.player1.life).toBe(22);
    const stream = events(engine), kill = stream.find(e => e.eventId === 'CREATURE_KILLED')!;
    expect(kill.payload.outcome).toMatchObject({ victim: { cardUuid: 'victim', zoneRevision: 0 }, reason: 'lethal', causes: [{ source: { card: { uuid: source.uuid } }, stackUuid: expect.any(String) }] });
    expect(stream.filter(e => e.eventId === 'PERMANENT_DIED')).toEqual([]);
    expect(stream.some(e => e.eventId === 'CHARACTERISTICS_CHANGED' && e.cause?.source?.card.uuid === source.uuid)).toBe(true);
  });
  it('does not award a kill or exile a surviving creature', () => {
    const { engine } = setup([shrink(2, { onKill: { destination: 'exile' }, recordOutcome: killed }), reward], 4);
    engine.resolveTopOfStack();
    expect(engine.roomState.battlefield.map(c => c.uuid)).toContain('victim');
    expect(engine.roomState.players.player1.life).toBe(20);
    expect(events(engine).filter(e => e.eventId === 'CREATURE_KILLED')).toEqual([]);
  });
  it('does not let an earlier nonlethal reduction steal a later kill or exile replacement', () => {
    const { engine, source } = setup([shrink(1, { onKill: { destination: 'exile' } })], 4);
    engine.resolveTopOfStack();
    const other = creature('other', 'player1'); engine.roomState.battlefield.push(other);
    const mutations = planDamage(engine.roomState, [{ source: captureSourceInformation(engine.roomState, other), recipient: { kind: 'permanent', cardUuid: 'victim', zoneRevision: 0 }, amount: 3, combat: false }]);
    engine.applyMutations(mutations); engine.givePriorityTo('player1');
    expect(engine.roomState.players.player2.graveyard.map(c => c.uuid)).toContain('victim');
    expect(engine.roomState.players.player2.exile ?? []).toEqual([]);
    const kill = events(engine).find(e => e.eventId === 'CREATURE_KILLED')!;
    expect(kill.payload.outcome.causes.map((c: any) => c.source?.card.uuid)).toEqual(['other']);
    expect(JSON.stringify(kill.payload.outcome.causes)).not.toContain(source.uuid);
    expect(kill.payload.outcome.contributors.map((c: any) => c.source?.card.uuid).sort()).toEqual([source.uuid, 'other'].sort());
    expect(kill.payload.outcome.history.map((h: any) => h.amount)).toEqual([1, 3]);
  });
  it('retains cause through an optional prevention choice, JSON reconstruction and a follow-up kill check', () => {
    const damage = { family: 'damage', operation: 'deal', params: { amount: 4 }, targeting: allOpponents, onKill: { destination: 'exile' }, recordOutcome: killed };
    const { engine } = setup([damage, reward], 3, { replacementEffects: [{ id: 'shield', label: 'Prevent two', optional: true, operation: { type: 'prevent_damage', amount: 2 }, match: { kinds: ['damage'] } }] });
    engine.resolveTopOfStack(); expect(engine.roomState.pendingChoice?.continuation.type).toBe('replacement');
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState))); engines.push(restored); restored.initRoom();
    const choice = restored.roomState.pendingChoice!;
    expect(restored.executePlayerAction(choice.playerId, 'choose', { choiceId: choice.id, choices: ['skip:shield'] }).success).toBe(true);
    expect(restored.roomState.players.player2.exile?.map(c => c.uuid)).toContain('victim');
    expect(restored.roomState.players.player1.life).toBe(22);
  });
  it('fully prevented damage has no kill, damage credit or reward', () => {
    const { engine } = setup([{ family: 'damage', operation: 'deal', params: { amount: 4 }, targeting: allOpponents, recordOutcome: killed }, reward], 3,
      { replacementEffects: [{ id: 'prevent', label: 'Prevent all', operation: { type: 'prevent_damage' }, match: { kinds: ['damage'] } }] });
    engine.resolveTopOfStack();
    expect(engine.roomState.battlefield[0].state.damageTaken).toBe(0); expect(engine.roomState.players.player1.life).toBe(20);
    expect(events(engine).filter(e => ['CREATURE_KILLED', 'DAMAGE_DEALT'].includes(e.eventId))).toEqual([]);
  });
  it('canceled destruction and sacrifice never become attributed kills', () => {
    const { engine } = setup([{ family: 'cards', operation: 'destroy', params: {}, targeting: allOpponents, recordOutcome: killed }, reward], 3,
      { replacementEffects: [{ id: 'save', label: 'Cancel', operation: { type: 'cancel_event' }, match: { kinds: ['destroy'] } }] });
    engine.resolveTopOfStack(); expect(engine.roomState.players.player1.life).toBe(20);
    engine.applyMutations([{ type: 'SACRIFICE_CARD', cardUuid: 'victim', zoneRevision: 0 }]);
    expect(events(engine).filter(e => e.eventId === 'CREATURE_KILLED')).toEqual([]);
  });
  it('a killer watcher can consume the same source attribution without a special soul event', () => {
    const { engine } = setup([shrink(2)], 2);
    const watcher = creature('watcher', 'player1');
    watcher.blueprint = parseCardDefinition({ schemaVersion: 1, id: 'watcher', name: 'Watcher', cardTypes: ['Creature'], power: 1, toughness: 3, abilities: [{ id: 'kill-draw', type: 'triggered', triggerCondition: 'ON_KILL', trigger: { cause: 'controller' }, effect: { family: 'cards', operation: 'draw', params: { amount: 1 } } }] });
    engine.roomState.battlefield.push(watcher); engine.resolveTopOfStack();
    expect(engine.roomState.stack.some(o => o.type === 'triggered' && o.source.uuid === watcher.uuid)).toBe(true);
    engine.resolveTopOfStack(); expect(engine.roomState.players.player1.hand).toHaveLength(1);
  });
});


describe('causal departure edge cases', () => {
  it('a departure redirected to hand is no kill and produces no success reward', () => {
    const { engine } = setup([{ family: 'cards', operation: 'destroy', params: {}, targeting: allOpponents, recordOutcome: killed }, reward], 3,
      { replacementEffects: [{ id: 'rescue', label: 'Return instead', operation: { type: 'move_destination', to: 'hand' }, match: { kinds: ['destroy'] } }] });
    engine.resolveTopOfStack(); expect(engine.roomState.players.player1.life).toBe(20);
    expect(engine.roomState.players.player2.hand.map(c => c.uuid)).toContain('victim');
    expect(events(engine).filter(e => e.eventId === 'CREATURE_KILLED')).toEqual([]);
  });
  it('keeps ability/source identity when activation sacrificed its source before a later kill', () => {
    const room = createTestRoom(); fillTestLibraries(room, 8);
    const source = creature('sacrificer', 'player1');
    source.blueprint = parseCardDefinition({ schemaVersion: 1, id: 'sacrificer', name: 'Sacrificer', cardTypes: ['Creature'], power: 1, toughness: 3,
      abilities: [{ id: 'shrink', type: 'activated', cost: { sacrifice: true }, effects: [shrink(2, { onKill: { destination: 'exile' }, recordOutcome: killed }), reward] }] });
    room.battlefield = [source, creature('victim', 'player2', 1, 2)];
    const engine = new GameEngine(room); engines.push(engine); engine.initRoom();
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'shrink' }).success).toBe(true);
    expect(engine.roomState.battlefield.some(c => c.uuid === source.uuid)).toBe(false);
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player2.exile?.map(c => c.uuid)).toContain('victim');
    expect(engine.roomState.players.player1.life).toBe(22);
    const kill = events(engine).find(e => e.eventId === 'CREATURE_KILLED')!;
    expect(kill.payload.outcome.causes[0]).toMatchObject({ abilityId: 'shrink', source: { card: { uuid: source.uuid, state: { zoneRevision: 0 } } } });
    expect(engine.roomState.turnHistory?.playerCounts.player1.CREATURE_KILLED).toBe(1);
  });
});


describe('history representation and simultaneous causes', () => {
  it('keeps actual earlier contribution receipts separate from the lethal-making cause', () => {
    const { engine, source } = setup([shrink(1)], 4); engine.resolveTopOfStack();
    const index = engine.roomState.causalState!['victim:0'];
    expect(index.history).toMatchObject([{ kind: 'characteristic', amount: 1, turnNumber: 1, cause: { source: { card: { uuid: source.uuid } } } }]);
    expect(index.lethal).toBeUndefined();
    expect(engine.roomState.turnHistory?.events.some(e => e.eventId === 'CHARACTERISTICS_CHANGED' && e.cause?.source?.card.uuid === source.uuid)).toBe(true);
  });
  it('retains all actual simultaneous sources independent of array order, including amounts after prevention', () => {
    for (const reverse of [false, true]) {
      const room = createTestRoom();
      const a = creature('a', 'player1'), b = creature('b', 'player1'), victim = creature('victim', 'player2', 1, 5);
      room.battlefield = [a, b, victim]; const engine = new GameEngine(room); engines.push(engine); engine.initRoom();
      const assignments = [a, b].map((source, i) => ({ source: captureSourceInformation(room, source), recipient: { kind: 'permanent' as const, cardUuid: victim.uuid, zoneRevision: 0 }, amount: i + 2, combat: false }));
      const planned = planDamage(engine.roomState, reverse ? assignments.reverse() : assignments);
      const preview = planned.reduce(gameReducer, engine.roomState);
      const attribution = preview.causalState!['victim:0'];
      engine.applyMutations(planned);
      expect(events(engine).find(e => e.eventId === 'CREATURE_KILLED')?.payload.outcome.causes).toHaveLength(2);
      expect(attribution.lethal?.map(c => c.source?.card.uuid).sort()).toEqual(['a', 'b']);
      expect(attribution.history?.map(h => h.amount).sort()).toEqual([2, 3]);
    }
  });
});


describe('counter-based and modified damage attribution', () => {
  it('attributes the existing scorch lethal transition to the counter placer', () => {
    const { engine, source } = setup([{ family: 'counters', operation: 'add', params: { counterType: 'scorch', amount: 3 }, targeting: allOpponents, onKill: { destination: 'exile' }, recordOutcome: killed }, reward], 2,
      { setup: { scorch: true } });
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player2.exile?.map(c => c.uuid)).toContain('victim');
    expect(engine.roomState.players.player1.life).toBe(22);
    const kill = events(engine).find(e => e.eventId === 'CREATURE_KILLED')!;
    expect(kill.payload.outcome.causes[0].source?.card.uuid).toBe(source.uuid);
  });
  it('retains prevention provenance while crediting actual damage to the original dealer', () => {
    const { engine, source } = setup([{ family: 'damage', operation: 'deal', params: { amount: 5 }, targeting: allOpponents, recordOutcome: killed }], 3,
      { replacementEffects: [{ id: 'reduce', label: 'Prevent two', operation: { type: 'prevent_damage', amount: 2 }, match: { kinds: ['damage'] } }] });
    engine.resolveTopOfStack();
    const damage = events(engine).find(e => e.eventId === 'DAMAGE_DEALT')!;
    expect(damage.payload.amount).toBe(3);
    expect(damage.cause).toMatchObject({ source: { card: { uuid: source.uuid } }, modifiers: [{ ruleId: 'reduce' }] });
  });
});


describe('existing sourced primitive compatibility', () => {
  it('attributes a sourced SET_DAMAGE lethal change through the shared cause contract', () => {
    const room = createTestRoom(), source = creature('legacy-dealer', 'player1'), earlier = creature('earlier-dealer', 'player1'), victim = creature('victim', 'player2', 1, 2);
    room.battlefield = [source, earlier, victim]; const engine = new GameEngine(room); engines.push(engine); engine.initRoom();
    engine.applyMutations([{ type: 'SET_DAMAGE', cardUuid: victim.uuid, amount: 1, source: earlier.uuid }, { type: 'SET_DAMAGE', cardUuid: victim.uuid, amount: 2, source: source.uuid }]);
    engine.givePriorityTo('player1');
    const kill = events(engine).find(e => e.eventId === 'CREATURE_KILLED')!;
    expect(kill.payload.outcome.causes[0].source?.card.uuid).toBe(source.uuid);
    expect(kill.payload.outcome.contributors.map((c: any) => c.source?.card.uuid).sort()).toEqual(['earlier-dealer', 'legacy-dealer']);
  });
});
