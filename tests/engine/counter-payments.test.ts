import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { instantiateCard } from '@library/card-factory';
import { planActionCosts } from '@engine/action-costs';
import { planCounterCosts } from '@engine/counter-costs';
import { composeActionCosts } from '@engine/cost-composition';
import { OptionService } from '@engine/option-service';
import { hasLegalNonPassAction } from '@engine/legal-actions';
import { parseCardDefinition } from '@library/card-parser';
import type { ActionCost } from '@shared/effect.types';
import type { CardInstance } from '@shared/card.types';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
const self = { type: 'self', required: false };
const draw = { family: 'cards', operation: 'draw', params: { amount: 1 }, targeting: self };
const life = { family: 'resources', operation: 'adjust_life', params: { amount: 3 }, targeting: self };
const sourceCost = { from: 'source' as const, counterType: 'charge', amount: 5 };
const fieldCost = { from: 'battlefield' as const, counterType: 'charge', amount: 3 };

function card(id: string, count = 0, owner = 'player1'): CardInstance {
  const result = creature(id, owner);
  result.blueprint = { ...result.blueprint, id, cardTypes: ['Artifact'] };
  result.state.counters.charge = count;
  return result;
}
function start(cost: ActionCost, count = 5, then?: unknown[]) {
  const source = card('counter-source', count);
  const effect = then ? { family: 'resources', operation: 'pay_cost', params: { cost, then }, targeting: self } : draw;
  source.blueprint = parseCardDefinition({
    schemaVersion: 1,
    id: 'counter-source',
    name: 'Counter Source',
    cardTypes: ['Artifact'],
    abilities: [
      {
        id: 'use',
        type: 'activated',
        cost: then ? {} : cost,
        usage: { period: 'game', identity: 'source_card', limit: 1, consume: 'on_commit' },
        effect,
      },
    ],
  });
  const room = createTestRoom();
  fillTestLibraries(room, 8);
  room.players.player1.hand = [];
  room.battlefield = [source];
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return { engine, source };
}
function activate(engine: GameEngine, source: CardInstance, data: Record<string, unknown> = {}) {
  return engine.executePlayerAction('player1', 'activate_ability', {
    cardUuid: source.uuid,
    abilityId: 'use',
    ...data,
  });
}
function choose(engine: GameEngine, choices: string[]) {
  const request = engine.roomState.pendingChoice!;
  return engine.executePlayerAction(request.playerId, 'choose', { choiceId: request.id, choices });
}
function allocate(engine: GameEngine, allocations: Record<string, number>) {
  const request = engine.roomState.pendingChoice!;
  return engine.executePlayerAction(request.playerId, 'choose', { choiceId: request.id, allocations });
}
function count(engine: GameEngine, id = 'counter-source') {
  return engine.roomState.battlefield.find((entry) => entry.uuid === id)!.state.counters.charge;
}

describe('counter payment inventory', () => {
  it('solves overlapping requirements without consuming the only eligible source greedily', () => {
    const room = createTestRoom(),
      source = card('source'),
      a = card('a', 1),
      b = card('b', 1);
    room.battlefield = [source, a, b];
    const before = JSON.stringify(room);
    const result = planCounterCosts(
      room,
      'player1',
      source,
      [
        { ...fieldCost, amount: 1 },
        { ...fieldCost, amount: 1, filter: { ids: ['a'] } },
      ],
      undefined,
      true,
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.reason);
    expect(result.payments[0][0].cardUuid).toBe('b');
    expect(result.payments[1][0].cardUuid).toBe('a');
    expect(JSON.stringify(room)).toBe(before);
  });
  it('combines base and additional counter clauses without double spending', () => {
    const room = createTestRoom(),
      source = card('source', 5);
    room.battlefield = [source];
    const cost = composeActionCosts([
      { removeCounters: [{ ...sourceCost, amount: 3 }] },
      { removeCounters: [{ ...sourceCost, amount: 3 }] },
    ]);
    expect(cost.removeCounters).toHaveLength(2);
    expect(planActionCosts(room, 'player1', source, cost).success).toBe(false);
    expect(source.state.counters.charge).toBe(5);
  });
  it.each([
    { 0: [{ cardUuid: 'a', zoneRevision: 0, amount: -1 }] },
    { 0: [{ cardUuid: 'a', zoneRevision: 0, amount: 1.5 }] },
    { 0: [{ cardUuid: 'a', zoneRevision: 4, amount: 3 }] },
    { 0: [{ cardUuid: 'a', zoneRevision: 0, amount: 1 }] },
    { 9: [{ cardUuid: 'a', zoneRevision: 0, amount: 3 }] },
    {
      0: [
        { cardUuid: 'a', zoneRevision: 0, amount: 2 },
        { cardUuid: 'a', zoneRevision: 0, amount: 1 },
      ],
    },
    { 0: [{ cardUuid: 'opponent', zoneRevision: 0, amount: 3 }] },
  ])('rejects forged, stale or incomplete allocations without changing the room: %j', (selection) => {
    const room = createTestRoom(),
      source = card('source'),
      a = card('a', 4),
      opponent = card('opponent', 8, 'player2');
    room.battlefield = [source, a, opponent];
    const before = JSON.stringify(room);
    expect(planCounterCosts(room, 'player1', source, [fieldCost], selection).success).toBe(false);
    expect(JSON.stringify(room)).toBe(before);
  });
  it('uses source revisions and the shared filter without treating payments as targets', () => {
    const room = createTestRoom(),
      source = card('source'),
      a = card('a', 4);
    a.blueprint = { ...a.blueprint, keywords: ['Shroud'] };
    room.battlefield = [source, a];
    expect(planCounterCosts(room, 'player1', source, [fieldCost], undefined, true).success).toBe(true);
    expect(
      planCounterCosts(room, 'player1', source, [{ ...fieldCost, filter: { ids: ['missing'] } }], undefined, true)
        .success,
    ).toBe(false);
    source.state.counters.charge = 5;
    const old = { ...source, state: { ...source.state, zoneRevision: 99 } };
    expect(planCounterCosts(room, 'player1', old, [sourceCost]).success).toBe(false);
  });
});

describe('action-time payment commitment', () => {
  it('commits counters, life, mana and usage together and retains payment after countering', () => {
    const { engine, source } = start({ removeCounters: [sourceCost], life: 2, mana: { black: 1 } });
    expect(activate(engine, source).success).toBe(true);
    expect(count(engine)).toBe(0);
    expect(engine.roomState.players.player1.life).toBe(18);
    expect(engine.roomState.players.player1.mana.black).toBe(4);
    expect(Object.values(engine.roomState.gameRuleUses!)).toEqual([1]);
    engine.applyMutations([{ type: 'COUNTER_STACK', stackUuid: engine.roomState.stack[0].uuid }]);
    expect(count(engine)).toBe(0);
    expect(engine.roomState.players.player1.hand).toEqual([]);
  });
  it('rejects insufficient counters without paying other costs or consuming a use', () => {
    const { engine, source } = start({ removeCounters: [sourceCost], life: 2, mana: { black: 1 } }, 4);
    const before = JSON.stringify(engine.roomState);
    expect(activate(engine, source).success).toBe(false);
    expect(JSON.stringify(engine.roomState)).toBe(before);
    expect(
      new OptionService()
        .getOptions(engine.roomState, 'player1', source.uuid, 'battlefield')
        .find((option) => option.data?.abilityId === 'use')?.disabled,
    ).toBe(true);
    expect(hasLegalNonPassAction(engine.roomState, 'player1').kind).toBe('none');
  });
  it('asks for a readable distribution and pays after all selections are confirmed', () => {
    const { engine, source } = start({ removeCounters: [fieldCost], life: 2 });
    engine.roomState.battlefield.push(card('second', 2));
    expect(activate(engine, source).success).toBe(true);
    const choice = engine.roomState.pendingChoice!;
    expect(choice.kind).toBe('distribution');
    expect(choice.prompt).toContain('3 charge counters');
    expect(count(engine)).toBe(5);
    expect(engine.roomState.players.player1.life).toBe(20);
    expect(allocate(engine, { 'counter-source:0': 1, 'second:0': 2 }).success).toBe(true);
    expect(count(engine)).toBe(4);
    expect(count(engine, 'second')).toBe(0);
    expect(engine.roomState.players.player1.life).toBe(18);
    expect(engine.roomState.stack).toHaveLength(1);
  });
  it('can cancel a payment-source choice without paying or using the ability', () => {
    const { engine, source } = start({ removeCounters: [fieldCost] });
    activate(engine, source);
    expect(
      engine.executePlayerAction('player1', 'choose', {
        choiceId: engine.roomState.pendingChoice!.id,
        cancel: true,
      }).success,
    ).toBe(true);
    expect(count(engine)).toBe(5);
    expect(engine.roomState.stack).toHaveLength(0);
    expect(engine.roomState.gameRuleUses).toBeUndefined();
  });
  it('rejects a changed announced cost while counter choices are pending', () => {
    const { engine, source } = start({ removeCounters: [fieldCost] });
    activate(engine, source);
    source.blueprint = {
      ...source.blueprint,
      abilities: source.blueprint.abilities.map((ability) =>
        ability.type === 'activated'
          ? { ...ability, cost: { removeCounters: [{ ...fieldCost, counterType: 'frost' }] } }
          : ability,
      ),
    };
    source.state.counters.frost = 9;
    const before = JSON.stringify(engine.roomState);
    expect(allocate(engine, { 'counter-source:0': 3 }).success).toBe(false);
    expect(JSON.stringify(engine.roomState)).toBe(before);
  });
  it('pays an exact debit despite a replacement that cancels ordinary counter changes', () => {
    const { engine, source } = start({ removeCounters: [sourceCost] });
    engine.roomState.replacementEffects = [
      {
        id: 'cancel-counters',
        label: 'Cancel counter effects',
        match: { kinds: ['counter_change'] },
        operation: { type: 'cancel_event' },
      },
    ];
    expect(activate(engine, source).success).toBe(true);
    expect(count(engine)).toBe(0);
    expect(engine.roomState.stack).toHaveLength(1);
  });
});

describe('optional resolution-time payment', () => {
  it('does not charge at announcement and declining skips the follow-up branch', () => {
    const { engine, source } = start({ removeCounters: [sourceCost] }, 6, [life, draw]);
    activate(engine, source);
    expect(count(engine)).toBe(6);
    engine.resolveTopOfStack();
    expect(count(engine)).toBe(6);
    expect(engine.roomState.pendingChoice!.prompt).toContain('Remove 5 charge');
    expect(choose(engine, ['no']).success).toBe(true);
    expect(count(engine)).toBe(6);
    expect(engine.roomState.players.player1.life).toBe(20);
    expect(engine.roomState.players.player1.hand).toEqual([]);
  });
  it('pays at acceptance and executes the full follow-up sequence', () => {
    const { engine, source } = start({ removeCounters: [sourceCost] }, 6, [life, draw]);
    activate(engine, source);
    engine.resolveTopOfStack();
    expect(choose(engine, ['yes']).success).toBe(true);
    expect(count(engine)).toBe(1);
    expect(engine.roomState.players.player1.life).toBe(23);
    expect(engine.roomState.players.player1.hand).toHaveLength(1);
  });
  it('skips an unaffordable branch without asking or executing its follow-up', () => {
    const { engine, source } = start({ removeCounters: [sourceCost] }, 4, [life]);
    activate(engine, source);
    engine.resolveTopOfStack();
    expect(count(engine)).toBe(4);
    expect(engine.roomState.players.player1.life).toBe(20);
    expect(engine.roomState.pendingChoice).toBeNull();
  });
  it('survives JSON reconstruction during counter-source selection', () => {
    const { engine, source } = start({ removeCounters: [fieldCost], life: 2 }, 5, [life]);
    engine.roomState.battlefield.push(card('second', 2));
    activate(engine, source);
    engine.resolveTopOfStack();
    choose(engine, ['yes']);
    expect(count(engine)).toBe(5);
    expect(engine.roomState.players.player1.life).toBe(20);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState)));
    engines.push(restored);
    restored.initRoom();
    expect(allocate(restored, { 'counter-source:0': 1, 'second:0': 2 }).success).toBe(true);
    expect(count(restored)).toBe(4);
    expect(count(restored, 'second')).toBe(0);
    expect(restored.roomState.players.player1.life).toBe(21);
  });
  it('can cancel after accepting, before selecting payment sources', () => {
    const { engine, source } = start({ removeCounters: [fieldCost] }, 5, [draw]);
    activate(engine, source);
    engine.resolveTopOfStack();
    choose(engine, ['yes']);
    expect(
      engine.executePlayerAction('player1', 'choose', {
        choiceId: engine.roomState.pendingChoice!.id,
        cancel: true,
      }).success,
    ).toBe(true);
    expect(count(engine)).toBe(5);
    expect(engine.roomState.players.player1.hand).toEqual([]);
  });
});

describe('strict readable cost authoring', () => {
  it.each([
    { from: 'source', counterType: 'charge', amount: -1 },
    { from: 'source', counterType: 'charge', amount: 1, filter: {} },
    { from: 'opponent', counterType: 'charge', amount: 1 },
    { from: 'source', counterType: 'charge', amount: 1, surprise: true },
  ])('rejects unsupported or malformed counter costs: %j', (cost) => {
    expect(() => start({ removeCounters: [cost as never] })).toThrow();
  });
  it('rejects branch targets without an explicit resolution choice', () => {
    expect(() => start({}, 5, [{ ...life, targeting: { type: 'permanent', required: true } }])).toThrow('resolution');
  });
});

function manaSource(engine: GameEngine, cost: ActionCost = { tap: true }, source?: CardInstance) {
  const land = source ?? instantiateCard('land-red');
  land.state = { ...land.state, zone: 'battlefield', ownerId: 'player1', controllerId: 'player1' };
  land.blueprint = {
    ...land.blueprint,
    abilities: [
      ...land.blueprint.abilities,
      {
        id: 'payment-mana',
        type: 'activated',
        castSpeed: 'instant',
        cost,
        effect: { action: 'ADD_MANA', params: { color: 'red', amount: 1 }, targeting: self },
      },
    ],
  };
  if (!source) engine.roomState.battlefield.push(land);
  engine.roomState.players.player1.mana.red = 0;
  return land;
}
function chooseMana(engine: GameEngine, id: string) {
  const choice = engine.roomState.pendingChoice!;
  const option =
    choice.kind !== 'number' &&
    choice.options.find(
      (option) =>
        (option.value as Record<string, unknown>)?.abilityId === 'payment-mana' &&
        (option.value as Record<string, unknown>)?.cardUuid === id,
    );
  if (!option) throw new Error('Expected the payment mana source');
  return choose(engine, [option.id]);
}

describe('mana generation inside an optional payment', () => {
  it('plans mana without granting priority and commits the whole payment once', () => {
    const { engine, source } = start({ mana: { red: 1 } }, 5, [life]);
    const land = manaSource(engine);
    activate(engine, source);
    engine.resolveTopOfStack();
    expect(choose(engine, ['yes']).success).toBe(true);
    expect(engine.roomState.priorityPlayerId).toBeNull();
    expect(engine.roomState.battlefield.find((c) => c.uuid === land.uuid)!.state.isTapped).toBe(false);
    expect(chooseMana(engine, land.uuid).success).toBe(true);
    expect(engine.roomState.players.player1.life).toBe(23);
    expect(engine.roomState.players.player1.mana.red).toBe(0);
    expect(engine.roomState.battlefield.find((c) => c.uuid === land.uuid)!.state.isTapped).toBe(true);
  });
  it('reuses ordinary mana-ability discard choices and pays nothing before their answer', () => {
    const { engine, source } = start({ mana: { red: 1 } }, 5, [life]);
    const land = manaSource(engine, { tap: true, discard: 1 });
    engine.roomState.players.player1.hand = [card('discard-me')];
    activate(engine, source);
    engine.resolveTopOfStack();
    choose(engine, ['yes']);
    expect(chooseMana(engine, land.uuid).success).toBe(true);
    expect(engine.roomState.pendingChoice?.kind).toBe('discard');
    expect(engine.roomState.players.player1.hand).toHaveLength(1);
    expect(choose(engine, ['discard-me']).success).toBe(true);
    expect(engine.roomState.players.player1.graveyard.map((c) => c.uuid)).toContain('discard-me');
    expect(engine.roomState.players.player1.life).toBe(23);
  });
  it('reuses counter distribution choices of the selected mana ability', () => {
    const { engine, source } = start({ mana: { red: 1 } }, 5, [life]);
    const land = manaSource(engine, { tap: true, removeCounters: [fieldCost] });
    activate(engine, source);
    engine.resolveTopOfStack();
    choose(engine, ['yes']);
    expect(chooseMana(engine, land.uuid).success).toBe(true);
    expect(engine.roomState.pendingChoice?.kind).toBe('distribution');
    expect(count(engine)).toBe(5);
    expect(allocate(engine, { 'counter-source:0': 3 }).success).toBe(true);
    expect(count(engine)).toBe(2);
    expect(engine.roomState.players.player1.life).toBe(23);
    const changed = engine
      .drainEventBatches()
      .flatMap((batch) => batch.events)
      .find((event) => event.eventId === 'COUNTER_CHANGED' && event.payload.amount === -3);
    expect(changed?.cause?.source?.card.uuid).toBe(land.uuid);
    expect(changed?.payload.sourceInfo?.card.uuid).toBe(land.uuid);
  });
  it('cancels a later parent selection without committing previewed mana generation', () => {
    const { engine, source } = start({ mana: { red: 1 }, discard: 1 }, 5, [life]);
    const land = manaSource(engine);
    engine.roomState.players.player1.hand = [card('keep-me')];
    activate(engine, source);
    engine.resolveTopOfStack();
    choose(engine, ['yes']);
    chooseMana(engine, land.uuid);
    expect(engine.roomState.pendingChoice?.kind).toBe('discard');
    expect(
      engine.executePlayerAction('player1', 'choose', {
        choiceId: engine.roomState.pendingChoice!.id,
        cancel: true,
      }).success,
    ).toBe(true);
    expect(engine.roomState.players.player1.hand).toHaveLength(1);
    expect(engine.roomState.players.player1.mana.red).toBe(0);
    expect(engine.roomState.battlefield.find((c) => c.uuid === land.uuid)!.state.isTapped).toBe(false);
    expect(engine.roomState.players.player1.life).toBe(20);
  });
  it('does not offer a mana source that spends the parent counter inventory', () => {
    const { engine, source } = start({ mana: { red: 1 }, removeCounters: [sourceCost] }, 5, [life]);
    manaSource(engine, { removeCounters: [{ ...sourceCost, amount: 1 }] }, source);
    activate(engine, source);
    engine.resolveTopOfStack();
    expect(engine.roomState.pendingChoice).toBeNull();
    expect(count(engine)).toBe(5);
    expect(engine.roomState.players.player1.life).toBe(20);
  });
  it('rejects a nested mana selection that leaves the parent counters unaffordable atomically', () => {
    const { engine, source } = start({ mana: { red: 1 }, removeCounters: [sourceCost] }, 5, [life]);
    const land = manaSource(engine, { tap: true, removeCounters: [fieldCost] });
    activate(engine, source);
    engine.resolveTopOfStack();
    choose(engine, ['yes']);
    expect(chooseMana(engine, land.uuid).success).toBe(true);
    const before = JSON.stringify(engine.roomState);
    expect(allocate(engine, { 'counter-source:0': 3 }).success).toBe(false);
    expect(JSON.stringify(engine.roomState)).toBe(before);
    expect(count(engine)).toBe(5);
    expect(engine.roomState.players.player1.mana.red).toBe(0);
  });
  it('can tap the payment source for mana before paying its untap cost', () => {
    const { engine, source } = start({ mana: { red: 1 }, untap: true }, 5, [life]);
    manaSource(engine, { tap: true }, source);
    activate(engine, source);
    engine.resolveTopOfStack();
    expect(engine.roomState.pendingChoice?.kind).toBe('optional');
    expect(choose(engine, ['yes']).success).toBe(true);
    expect(chooseMana(engine, source.uuid).success).toBe(true);
    expect(engine.roomState.players.player1.life).toBe(23);
    expect(engine.roomState.battlefield[0].state.isTapped).toBe(false);
  });
});
