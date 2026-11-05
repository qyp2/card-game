import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { planDamage } from '@engine/damage-service';
import { captureSourceInformation } from '@engine/source-information';
import { instantiateCard } from '@library/card-factory';
import { parseCounterDefinitions } from '@card-game/engine/rules/parse';
import type { CardInstance } from '@shared/card.types';
import { creature } from '../helpers/combat-fixture';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));

function start(...cards: CardInstance[]) {
  const room = createTestRoom();
  fillTestLibraries(room, 8);
  room.battlefield = cards;
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return engine;
}

function find(engine: GameEngine, card: CardInstance) {
  return engine.roomState.battlefield.find((current) => current.uuid === card.uuid)!;
}

function place(engine: GameEngine, card: CardInstance, counterType: string, amount = 1) {
  engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: card.uuid, counterType, amount }]);
}

function remove(engine: GameEngine, card: CardInstance, counterType: string, amount = 1) {
  engine.applyMutations([{ type: 'REMOVE_COUNTER', cardUuid: card.uuid, counterType, amount }]);
}

function damage(engine: GameEngine, victims: CardInstance[], preventable = true) {
  const room = engine.roomState;
  const source = captureSourceInformation(room, creature('attacker', 'player2'));
  engine.applyMutations(
    planDamage(
      room,
      victims.map((victim) => ({
        source,
        amount: 4,
        combat: false,
        preventable,
        recipient: {
          kind: 'permanent',
          cardUuid: victim.uuid,
          zoneRevision: find(engine, victim).state.zoneRevision ?? 0,
        },
      })),
    ),
  );
}

const frost = 'frost-gear';

describe('counter rule configuration', () => {
  const rule = {
    id: 'boost',
    family: 'characteristics',
    scope: { self: true },
    operation: { type: 'STAT_DELTA', power: 1 },
  };

  it.each([
    { maxPerCard: 0, rules: [rule] },
    { maxPerCard: 1.5, rules: [rule] },
    { rules: [] },
    { rules: [rule, rule] },
    { rules: [{ ...rule, condition: { op: 'eq', left: { path: 'event.payload.amount' }, right: 1 } }] },
    { rules: [rule], duration: 'forever' },
  ])('rejects invalid counter data %j', (definition) => {
    expect(() => parseCounterDefinitions({ example: definition })).toThrow();
  });
});

describe('counter-owned gameplay', () => {
  it('makes Aurora an independent one-time shield on each holder even after the giver leaves', () => {
    const giver = creature('giver', 'player1'),
      a = creature('a', 'player1', 2, 30),
      b = creature('b', 'player1', 2, 30);
    const engine = start(giver, a, b);
    place(engine, a, 'aurora', 2);
    place(engine, b, 'aurora');
    engine.applyMutations([
      { type: 'MOVE_CARD', cardUuid: giver.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' },
    ]);
    damage(engine, [a, a, b]);
    expect(find(engine, a).state.damageTaken).toBe(5);
    expect(find(engine, b).state.damageTaken).toBe(1);
    expect(Object.values(engine.roomState.gameRuleUses ?? {})).toEqual([1, 1]);

    engine.applyMutations([{ type: 'SET_TURN', playerId: 'player2', advance: true }]);
    remove(engine, a, 'aurora', 2);
    place(engine, a, 'aurora');
    const resumed = new GameEngine(JSON.parse(JSON.stringify(engine.roomState)));
    resumed.initRoom();
    engines.push(resumed);
    const damageBefore = find(resumed, a).state.damageTaken;
    damage(resumed, [a]);
    expect(find(resumed, a).state.damageTaken - damageBefore).toBe(4);
  });

  it('clears counters on leaving and gives a newly marked incarnation a fresh shield', () => {
    const holder = creature('holder', 'player1', 2, 30);
    const engine = start(holder);
    place(engine, holder, 'aurora');
    damage(engine, [holder]);
    engine.applyMutations([
      { type: 'MOVE_CARD', cardUuid: holder.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' },
      { type: 'MOVE_CARD', cardUuid: holder.uuid, playerId: 'player1', from: 'graveyard', to: 'battlefield' },
    ]);
    expect(find(engine, holder).state.counters.aurora ?? 0).toBe(0);
    place(engine, holder, 'aurora');
    damage(engine, [holder]);
    expect(find(engine, holder).state.damageTaken).toBe(1);
  });

  it('keeps the one-time Aurora shield available when damage cannot be prevented', () => {
    const holder = creature('holder', 'player1', 2, 30);
    const engine = start(holder);
    place(engine, holder, 'aurora');
    damage(engine, [holder], false);
    expect(find(engine, holder).state.damageTaken).toBe(4);
    expect(Object.values(engine.roomState.gameRuleUses ?? {})).toEqual([]);
    damage(engine, [holder]);
    expect(find(engine, holder).state.damageTaken).toBe(5);
    expect(Object.values(engine.roomState.gameRuleUses ?? {})).toEqual([1]);
  });

  it('caps frost gear placements and gives the equipped attacker one draw through the trigger pipeline', () => {
    const equipment = instantiateCard('vitality-wood-staff');
    equipment.state = { ...equipment.state, zone: 'battlefield', ownerId: 'player1', controllerId: 'player1' };
    const a = creature('first-host', 'player1'),
      b = creature('next-host', 'player1');
    const engine = start(equipment, a, b);
    const attack = (host: CardInstance) =>
      engine.applyMutations([
        {
          type: 'DECLARE_ATTACKERS',
          declarations: [{ uuid: host.uuid + '-attack', attacker: find(engine, host), attackerPower: 2, blockers: [] }],
        },
      ]);
    const attach = (host: CardInstance) =>
      engine.applyMutations([
        {
          type: 'ATTACH_CARD',
          cardUuid: equipment.uuid,
          zoneRevision: equipment.state.zoneRevision ?? 0,
          hostUuid: host.uuid,
          hostRevision: host.state.zoneRevision ?? 0,
          controllerId: 'player1',
        },
      ]);
    place(engine, equipment, frost, 3);
    place(engine, equipment, frost);
    expect(find(engine, equipment).state.counters[frost]).toBe(1);
    const changes = engine
      .drainEventBatches()
      .flatMap((batch) => batch.events)
      .filter((event) => event.eventId === 'COUNTER_CHANGED');
    expect(changes).toHaveLength(1);
    expect(changes[0].payload.amount).toBe(1);
    attack(a);
    expect(engine.roomState.stack).toHaveLength(0);
    attach(a);
    attack(a);
    expect(engine.roomState.stack.map((object) => object.source.uuid)).toEqual([a.uuid]);
    const hand = engine.roomState.players.player1.hand.length;
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.hand).toHaveLength(hand + 1);
    attach(b);
    attack(a);
    expect(engine.roomState.stack).toHaveLength(0);
    attack(b);
    expect(engine.roomState.stack.map((object) => object.source.uuid)).toEqual([b.uuid]);
    engine.resolveTopOfStack();
    remove(engine, equipment, frost);
    attack(b);
    expect(engine.roomState.stack).toHaveLength(0);
  });
});
