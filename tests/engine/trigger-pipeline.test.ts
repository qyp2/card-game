import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { EventBus } from '@engine/event-bus';
import { TriggerManager, discoverTriggers } from '@engine/trigger-manager';
import { captureSourceInformation } from '@engine/source-information';
import { abilityUsageAvailable } from '@engine/ability-usage';
import { abilityUseKey } from '@engine/turn-history';
import { PermissionRegistry } from '@engine/permission-registry';
import { instantiateCard } from '@library/card-factory';
import { getBlueprint, getCardIds } from '@library/card-catalog';
import { parseAbilityDefinition, parseCardDefinition } from '@library/card-parser';
import type { CardInstance, CardZone } from '@shared/card.types';
import type { GameMutation } from '@shared/game-mutation.types';
import { createTestRoom } from '../helpers/test-room-factory';

const life = { family: 'resources', operation: 'adjust_life', params: { amount: 2 } };
const target = {
  family: 'orientation',
  operation: 'tap',
  targeting: { type: 'permanent', controller: 'opponent', required: true },
};
const usage = { period: 'game', identity: 'source_card', limit: 1, consume: 'on_commit' };
const board = { kind: 'watcher', activeZones: ['battlefield'] };
const engines: GameEngine[] = [],
  cleanups: (() => void)[] = [];
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function card(abilities: unknown[] = [], zone: CardZone = 'battlefield', owner = 'player1'): CardInstance {
  const source = instantiateCard('empire-servant');
  source.blueprint = parseCardDefinition({
    schemaVersion: 1,
    id: 'pipeline-fixture',
    name: 'Pipeline fixture',
    cardTypes: ['Creature'],
    power: 1,
    toughness: 3,
    abilities,
  });
  source.state = { ...source.state, zone, ownerId: owner, controllerId: owner };
  return source;
}
function trigger(extra: Record<string, unknown> = {}) {
  return {
    id: 'test',
    type: 'triggered',
    triggerCondition: 'BEGIN_UPKEEP',
    trigger: { listener: board },
    effect: target,
    usage,
    ...extra,
  };
}
function start(ability: Record<string, unknown> = trigger()) {
  const room = createTestRoom(),
    source = card([ability]);
  room.players.player1.hand = [];
  room.battlefield = [source];
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return { engine, source };
}
function fire(engine: GameEngine) {
  engine.applyMutations([{ type: 'SET_PHASE', phase: 'upkeepStep' }]);
}
function gameUses(engine: GameEngine) {
  return Object.values(engine.roomState.gameRuleUses ?? {}).reduce((a, b) => a + b, 0);
}
function answer(engine: GameEngine, choices: string[]) {
  return engine.executePlayerAction('player1', 'choose', { choiceId: engine.roomState.pendingChoice!.id, choices });
}

describe('after-event conditions with historical listener characteristics', () => {
  it.each(['before', 'after'] as const)('counts the newly milled card with a %s listener', (state) => {
    const { engine } = start(trigger({ effect: life, usage: undefined }));
    engine.roomState.battlefield = [];
    const milled = card(
      [
        trigger({
          triggerCondition: 'ON_DISCARD_FROM_LIBRARY',
          effect: life,
          trigger: {
            listener: { kind: 'event_card', state, zones: [state === 'before' ? 'library' : 'graveyard'] },
            condition: {
              all: [
                { op: 'eq', left: { path: 'controller.graveyard.length' }, right: 5 },
                { op: 'eq', left: { path: 'source.state.zone' }, right: state === 'before' ? 'library' : 'graveyard' },
              ],
            },
          },
        }),
      ],
      'library',
    );
    engine.roomState.players.player1.graveyard = Array.from({ length: 4 }, () => card([], 'graveyard'));
    engine.roomState.players.player1.deck = [milled];
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: milled.uuid,
        playerId: 'player1',
        from: 'library',
        to: 'graveyard',
        reason: 'discard',
      },
    ]);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.roomState.stack[0].source.state.zone).toBe(state === 'before' ? 'library' : 'graveyard');
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(22);
  });
  it('uses before-state membership for a death watcher and after-state board conditions', () => {
    const { engine, source } = start(
      trigger({
        triggerCondition: 'ON_DIE',
        effect: life,
        trigger: {
          listener: board,
          subject: 'self',
          condition: { op: 'eq', left: { path: 'controller.graveyard.length' }, right: 1 },
        },
      }),
    );
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: source.uuid,
        playerId: 'player1',
        from: 'battlefield',
        to: 'graveyard',
        reason: 'destroy',
      },
    ]);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.roomState.stack[0].sourceInfo?.card.state.zone).toBe('battlefield');
  });
  it('provides the same subject facts to explicit, saved implicit and delayed listeners', () => {
    const condition = { op: 'eq', left: { path: 'event.subject.before.zone' }, right: 'library' };
    const make = (id: string, explicit: boolean) =>
      trigger({
        id,
        triggerCondition: 'ON_DISCARD_FROM_LIBRARY',
        effect: life,
        trigger: { ...(explicit ? { listener: board } : {}), subject: 'another', condition },
      });
    const source = card([make('explicit', true), make('saved-implicit', false)]);
    const room = createTestRoom({ battlefield: [source] });
    const milled = card([], 'library');
    room.players.player1.deck = [milled];
    const ability = parseAbilityDefinition(make('delayed', false));
    if (!ability || ability.type !== 'triggered') throw new Error('Expected trigger');
    room.delayedTriggers = [
      {
        id: 'registration',
        source,
        sourceInfo: captureSourceInformation(room, source),
        controllerId: 'player1',
        ability,
        lifetime: 'once',
      },
    ];
    const after = structuredClone(room);
    after.players.player1.deck = [];
    const arrived = structuredClone(milled);
    arrived.state.zone = 'graveyard';
    arrived.state.zoneRevision = 1;
    after.players.player1.graveyard = [arrived];
    const collector: GameMutation[] = [],
      bus = new EventBus(room.roomId);
    const manager = new TriggerManager(
      bus,
      collector,
      () => 'trigger',
      () => after,
    );
    bus.emit(
      {
        eventId: 'CARD_DISCARDED_FROM_LIBRARY',
        roomId: room.roomId,
        eventUuid: 'mill',
        payload: { card: milled, playerId: 'player1', controllerId: 'player1' },
      },
      { before: room, after },
    );
    expect(
      collector.filter((m) => m.type === 'PUSH_STACK').map((m) => m.type === 'PUSH_STACK' && m.stackObject.ability?.id),
    ).toEqual(['explicit', 'saved-implicit', 'delayed']);
    expect(collector.filter((m) => m.type === 'REMOVE_DELAYED_TRIGGER')).toEqual([
      { type: 'REMOVE_DELAYED_TRIGGER', id: 'registration' },
    ]);
    manager.dispose(bus);
  });
});

describe('required target admission before occurrence and budget accounting', () => {
  it('does not queue, count or spend an impossible trigger; a later event can still use it', () => {
    const { engine, source } = start();
    fire(engine);
    expect(engine.roomState.stack).toEqual([]);
    expect(engine.roomState.triggerQueue).toBeFalsy();
    expect(engine.roomState.pendingChoice).toBeFalsy();
    expect(engine.roomState.turnHistory?.uses[abilityUseKey(source, 'test')]).toBeUndefined();
    expect(gameUses(engine)).toBe(0);
    engine.roomState.battlefield.push(card([], 'battlefield', 'player2'));
    engine.applyMutations([{ type: 'SET_PHASE', phase: 'stateMainPhase' }]);
    fire(engine);
    expect(engine.roomState.pendingChoice?.kind).toBe('targets');
    expect(gameUses(engine)).toBe(1);
    expect(engine.roomState.turnHistory?.uses[abilityUseKey(source, 'test')]).toBe(1);
  });
  it('does not count an unlimited trigger when its required target is absent either', () => {
    const { engine, source } = start(trigger({ usage: undefined }));
    fire(engine);
    expect(engine.roomState.turnHistory?.uses[abilityUseKey(source, 'test')]).toBeUndefined();
  });
  it.each([
    { ...target, targeting: { ...target.targeting, required: false } },
    { ...target, targeting: { ...target.targeting, all: true } },
    life,
  ])('retains optional-target and untargeted abilities %j', (effect) => {
    const { engine } = start(trigger({ effect }));
    fire(engine);
    expect(gameUses(engine)).toBe(1);
    if (engine.roomState.pendingChoice) expect(answer(engine, []).success).toBe(true);
    expect(engine.roomState.stack).toHaveLength(1);
  });
  it('checks every target group and registered restrictions before reserving a use', () => {
    const { engine, source } = start(
      trigger({
        effect: undefined,
        effects: [
          { ...life, targetGroup: 'own', targeting: { type: 'player', controller: 'self', required: true } },
          { ...target, targetGroup: 'enemy' },
        ],
      }),
    );
    const enemy = card([], 'battlefield', 'player2');
    engine.roomState.battlefield.push(enemy);
    cleanups.push(
      PermissionRegistry.registerTargetRule(
        (_room, _player, from, to) => from.uuid !== source.uuid || to.cardUuid !== enemy.uuid,
      ),
    );
    fire(engine);
    expect(gameUses(engine)).toBe(0);
    expect(engine.roomState.pendingChoice).toBeFalsy();
  });
  it('does not remove an impossible one-shot delayed registration', () => {
    const { engine, source } = start(trigger({ triggerCondition: 'ON_ATTACK', effect: life }));
    const ability = parseAbilityDefinition(trigger({ trigger: undefined }));
    if (!ability || ability.type !== 'triggered') throw new Error('Expected trigger');
    engine.roomState.delayedTriggers = [
      {
        id: 'later',
        source,
        sourceInfo: captureSourceInformation(engine.roomState, source),
        controllerId: 'player1',
        ability,
        lifetime: 'once',
      },
    ];
    fire(engine);
    expect(gameUses(engine)).toBe(0);
    expect(engine.roomState.delayedTriggers).toHaveLength(1);
    engine.roomState.battlefield.push(card([], 'battlefield', 'player2'));
    engine.applyMutations([{ type: 'SET_PHASE', phase: 'stateMainPhase' }]);
    fire(engine);
    expect(engine.roomState.delayedTriggers).toEqual([]);
    expect(gameUses(engine)).toBe(1);
  });
});

describe('modal and divided preparation share scheduling rules', () => {
  it('offers a legal mode while excluding a mode with no required target, through JSON recovery', () => {
    const { engine } = start(
      trigger({
        effect: { ...life, params: { amount: 0 } },
        modes: [
          { id: 'impossible', label: 'No enemy', effects: [target] },
          { id: 'possible', label: 'Gain life', effects: [life] },
        ],
      }),
    );
    fire(engine);
    expect(engine.roomState.pendingChoice?.options.map((option) => option.id)).toEqual(['possible']);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState)));
    restored.initRoom();
    engines.push(restored);
    expect(answer(restored, ['impossible']).success).toBe(false);
    expect(answer(restored, ['possible']).success).toBe(true);
    restored.resolveTopOfStack();
    expect(restored.roomState.players.player1.life).toBe(22);
    expect(gameUses(restored)).toBe(1);
  });
  it('does not accept an individually viable but incompatible shared-group mode combination', () => {
    const mode = (id: string, controller: string) => ({
      id,
      label: id,
      effects: [{ ...life, targetGroup: 'shared', targeting: { type: 'player', controller, required: true } }],
    });
    const { engine } = start(
      trigger({
        effect: { ...life, params: { amount: 0 } },
        modes: [mode('own', 'self'), mode('enemy', 'opponent')],
        modeCount: { min: 1, max: 2 },
      }),
    );
    fire(engine);
    const before = structuredClone(engine.roomState);
    expect(answer(engine, ['own', 'enemy']).success).toBe(false);
    expect(engine.roomState).toEqual(before);
    expect(answer(engine, ['own']).success).toBe(true);
  });
  it('does not trigger when all modes require absent targets', () => {
    const { engine } = start(
      trigger({
        effect: { ...life, params: { amount: 0 } },
        modes: [
          { id: 'one', label: 'One', effects: [target] },
          { id: 'two', label: 'Two', effects: [target] },
        ],
      }),
    );
    fire(engine);
    expect(gameUses(engine)).toBe(0);
    expect(engine.roomState.pendingChoice).toBeFalsy();
  });
  it('rejects a divided effect that cannot allocate at least one unit per required target', () => {
    const { engine } = start(
      trigger({
        effect: {
          ...life,
          targeting: { type: 'player', required: true, minTargets: 2, maxTargets: 2 },
          choice: { kind: 'distribution', total: 1 },
        },
      }),
    );
    fire(engine);
    expect(gameUses(engine)).toBe(0);
    expect(engine.roomState.stack).toEqual([]);
  });
});

describe('common usage consumer preserves independent constraints and identities', () => {
  it('enforces an old turn limit together with a physical-card game budget', () => {
    const { engine, source } = start(trigger({ effect: life, limitPerTurn: 1, usage: { ...usage, limit: 2 } }));
    fire(engine);
    expect(gameUses(engine)).toBe(1);
    engine.resolveTopOfStack();
    engine.applyMutations([{ type: 'SET_PHASE', phase: 'stateMainPhase' }]);
    fire(engine);
    expect(engine.roomState.stack).toEqual([]);
    engine.applyMutations([
      { type: 'SET_TURN', playerId: 'player2', advance: true },
      { type: 'SET_PHASE', phase: 'stateMainPhase' },
    ]);
    // The event belongs to player2, while this listener intentionally watches either player.
    source.blueprint = {
      ...source.blueprint,
      abilities: source.blueprint.abilities.map((ability) =>
        ability.type === 'triggered' ? { ...ability, trigger: { ...ability.trigger, controller: 'any' } } : ability,
      ),
    };
    fire(engine);
    expect(gameUses(engine)).toBe(2);
    engine.resolveTopOfStack();
    engine.applyMutations([
      { type: 'SET_TURN', playerId: 'player1', advance: true },
      { type: 'SET_PHASE', phase: 'stateMainPhase' },
    ]);
    fire(engine);
    expect(engine.roomState.stack).toEqual([]);
  });
  it('checks controller budgets against effective control, matching the recorded debit', () => {
    const { engine, source } = start(
      trigger({
        effect: life,
        usage: { ...usage, identity: 'controller', group: 'shared' },
        trigger: { listener: board, controller: 'any' },
      }),
    );
    engine.roomState.continuousEffectPool.push({
      id: 'control',
      source: 'global',
      layer: 2,
      duration: 'PERMANENT',
      requiredZone: null,
      origin: 'resolved',
      scope: { cardUuid: source.uuid },
      effect: { type: 'CONTROL', controllerId: 'player2' },
    });
    fire(engine);
    const ability = source.blueprint.abilities[0];
    if (ability.type !== 'triggered') throw new Error('Expected trigger');
    expect(abilityUsageAvailable(engine.roomState, source, ability)).toBe(false);
    expect(engine.roomState.gameRuleUses?.['usage:player2:group:shared']).toBe(1);
  });
});

it('all shipped ordinary triggered abilities declare their listener, including granted abilities', () => {
  let count = 0;
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.type === 'triggered') {
      count++;
      expect(record.trigger).toHaveProperty('listener');
      expect(record).not.toHaveProperty('limitPerTurn');
    }
    for (const [key, child] of Object.entries(record)) if (key !== 'rules') visit(child);
  }
  for (const id of getCardIds()) visit(getBlueprint(id));
  expect(count).toBeGreaterThanOrEqual(59);
});

it('keeps entry shorthand distinct from an authored ability named on-enter', () => {
  const { engine, source } = start(
    trigger({ id: 'on-enter', triggerCondition: 'ON_ENTER_BATTLEFIELD', effect: life, usage: undefined }),
  );
  source.blueprint = {
    ...source.blueprint,
    onEnterEffects: [{ action: 'MODIFY_LIFE', params: { amount: 3 }, targeting: { type: 'self', required: false } }],
  };
  engine.roomState.battlefield = [];
  source.state.zone = 'hand';
  engine.roomState.players.player1.hand = [source];
  engine.applyMutations([
    { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'hand', to: 'battlefield' },
  ]);
  expect(engine.roomState.triggerQueue?.entries).toHaveLength(2);
  expect(engine.roomState.pendingChoice?.kind).toBe('ordering');
});

it('does not discover a newer event-card incarnation from a stale entry event', () => {
  const source = card([
    trigger({
      triggerCondition: 'ON_ENTER_BATTLEFIELD',
      effect: life,
      usage: undefined,
      trigger: { listener: { kind: 'event_card', state: 'after', zones: ['battlefield'] } },
    }),
  ]);
  source.state.zoneRevision = 4;
  const old = structuredClone(source);
  old.state.zoneRevision = 2;
  const room = createTestRoom({ battlefield: [source] });
  expect(
    discoverTriggers(
      { eventId: 'PERMANENT_ENTERED', roomId: room.roomId, payload: { card: old, controllerId: 'player1' } },
      { room, roomId: room.roomId, battlefield: room.battlefield, after: room },
    ),
  ).toEqual([]);
});

it('prunes a large collection of modes with impossible required targets', () => {
  const { engine } = start(
    trigger({
      effect: { ...life, params: { amount: 0 } },
      modeCount: { min: 20, max: 20 },
      modes: Array.from({ length: 40 }, (_, index) => ({
        id: 'mode-' + index,
        label: 'Mode ' + index,
        effects: [target],
      })),
    }),
  );
  fire(engine);
  expect(gameUses(engine)).toBe(0);
  expect(engine.roomState.pendingChoice).toBeFalsy();
});

it('considers mode order when explicit and position-based target groups can collide', () => {
  const { engine } = start(
    trigger({
      effect: { ...life, params: { amount: 0 } },
      modeCount: { min: 2, max: 2 },
      modes: [
        {
          id: 'a',
          label: 'A',
          effects: [{ ...life, targeting: { type: 'player', controller: 'opponent', required: true } }],
        },
        {
          id: 'b',
          label: 'B',
          effects: [
            { ...life, targetGroup: 'effect-1', targeting: { type: 'player', controller: 'self', required: true } },
          ],
        },
      ],
    }),
  );
  fire(engine);
  expect(engine.roomState.pendingChoice?.kind).toBe('modes');
  expect(answer(engine, ['a', 'b']).success).toBe(false);
  expect(answer(engine, ['b', 'a']).success).toBe(true);
  expect(engine.roomState.pendingChoice?.kind).toBe('targets');
});
