import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { instantiateCard } from '@library/card-factory';
import type { CardZone } from '@shared/card.types';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function card(id: string, zone: CardZone = 'battlefield', owner = 'player1') {
  const value = instantiateCard(id);
  value.state = { ...value.state, zone, ownerId: owner, controllerId: owner, summoningSickness: false };
  return value;
}
function game(id: string, charge: number) {
  const room = createTestRoom();
  fillTestLibraries(room);
  room.players.player1.hand = [];
  const source = card(id);
  source.state.counters.charge = charge;
  room.battlefield = [source];
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return { engine, source };
}
function choose(engine: GameEngine, choices: string[]) {
  const choice = engine.roomState.pendingChoice!;
  expect(engine.executePlayerAction(choice.playerId, 'choose', { choiceId: choice.id, choices }).success).toBe(true);
}
function angelInHand(engine: GameEngine) {
  const angel = creature('hand-angel', 'player1');
  angel.blueprint = { ...angel.blueprint, subTypes: ['上使'], abilities: [] };
  angel.state.zone = 'hand';
  engine.roomState.players.player1.hand.push(angel);
  return angel;
}
function charge(engine: GameEngine, id: string) {
  return engine.roomState.battlefield.find((c) => c.uuid === id)!.state.counters.charge;
}

describe('Hera counter payment card', () => {
  it('only pays for a tapped opposing creature and destroys it on resolution', () => {
    const { engine, source } = game('phantom-queen-hera', 5);
    const enemy = creature('enemy', 'player2');
    engine.roomState.battlefield.push(enemy);
    const activate = () =>
      engine.executePlayerAction('player1', 'activate_ability', {
        cardUuid: source.uuid,
        abilityId: 'charged-destruction',
        targets: [{ targetType: 'permanent', cardUuid: enemy.uuid }],
      });
    const before = JSON.stringify(engine.roomState);
    expect(activate().success).toBe(false);
    expect(JSON.stringify(engine.roomState)).toBe(before);
    enemy.state.isTapped = true;
    expect(activate().success).toBe(true);
    expect(charge(engine, source.uuid)).toBe(0);
    expect(engine.roomState.battlefield.some((c) => c.uuid === enemy.uuid)).toBe(true);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(engine.roomState.players.player2.graveyard.map((c) => c.uuid)).toContain(enemy.uuid);
    engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: source.uuid, counterType: 'charge', amount: 5 }]);
    engine.givePriorityTo('player1');
    const second = creature('second-enemy', 'player2');
    second.state.isTapped = true;
    engine.roomState.battlefield.push(second);
    expect(
      engine.executePlayerAction('player1', 'activate_ability', {
        cardUuid: source.uuid,
        abilityId: 'charged-destruction',
        targets: [{ targetType: 'permanent', cardUuid: second.uuid }],
      }).success,
    ).toBe(false);
    expect(charge(engine, source.uuid)).toBe(5);
  });
  it('charges from friendly puppets entering and produces black mana', () => {
    const { engine, source } = game('phantom-queen-hera', 0);
    for (const owner of ['player2', 'player1']) {
      const puppet = card('phantom-puppet', 'hand', owner);
      engine.roomState.players[owner].hand.push(puppet);
      engine.applyMutations([
        { type: 'MOVE_CARD', cardUuid: puppet.uuid, playerId: owner, from: 'hand', to: 'battlefield' },
      ]);
      if (owner === 'player2') expect(engine.roomState.stack).toHaveLength(0);
    }
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(charge(engine, source.uuid)).toBe(1);
    engine.givePriorityTo('player1');
    const mana = engine.roomState.players.player1.mana.black;
    expect(
      engine.executePlayerAction('player1', 'tapForMana', {
        cardUuid: source.uuid,
        abilityId: 'mana',
      }).success,
    ).toBe(true);
    expect(engine.roomState.players.player1.mana.black).toBe(mana + 1);
  });
});

describe('Aralaria optional counter payment card', () => {
  it.each(['yes', 'no'])('healing crosses the threshold; payment decision=%s', (decision) => {
    const { engine, source } = game('angel-emperor-aralaria', 4);
    const angel = angelInHand(engine);
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 21 }]);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(charge(engine, source.uuid)).toBe(5);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(engine.roomState.pendingChoice?.kind).toBe('optional');
    expect(charge(engine, source.uuid)).toBe(5);
    choose(engine, [decision]);
    if (decision === 'no') {
      expect(charge(engine, source.uuid)).toBe(5);
      expect(engine.roomState.players.player1.hand.map((c) => c.uuid)).toContain(angel.uuid);
    } else {
      expect(charge(engine, source.uuid)).toBe(0);
      expect(engine.roomState.pendingChoice).toMatchObject({ kind: 'search', min: 1, max: 1 });
      choose(engine, [angel.uuid]);
      expect(engine.roomState.battlefield.map((c) => c.uuid)).toContain(angel.uuid);
      expect(engine.roomState.players.player1.hand).toHaveLength(0);
    }
    expect(engine.roomState.stack).toHaveLength(0);
    expect(engine.roomState.pendingChoice).toBeNull();
  });
  it('does not ask for payment without a matching angel and does not trigger on removal', () => {
    const { engine, source } = game('angel-emperor-aralaria', 4);
    engine.roomState.players.player1.hand.push(card('land-red', 'hand'));
    engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: source.uuid, counterType: 'charge', amount: 1 }]);
    expect(engine.roomState.stack).toHaveLength(1);
    engine.resolveTopOfStack();
    expect(engine.roomState.pendingChoice).toBeNull();
    expect(charge(engine, source.uuid)).toBe(5);
    engine.applyMutations([{ type: 'REMOVE_COUNTER', cardUuid: source.uuid, counterType: 'charge', amount: 1 }]);
    expect(engine.roomState.stack).toHaveLength(0);
  });
  it('does not take counters from a new incarnation of the departed source', () => {
    const { engine, source } = game('angel-emperor-aralaria', 4);
    angelInHand(engine);
    engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: source.uuid, counterType: 'charge', amount: 1 }]);
    engine.applyMutations([
      { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'exile' },
    ]);
    engine.applyMutations([
      { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'exile', to: 'battlefield' },
    ]);
    // Model counters already present on the new incarnation without creating another trigger.
    engine.roomState.battlefield.find((c) => c.uuid === source.uuid)!.state.counters.charge = 8;
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(engine.roomState.pendingChoice).toBeNull();
    expect(charge(engine, source.uuid)).toBe(8);
    expect(engine.roomState.players.player1.hand).toHaveLength(1);
  });
});
