import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { buildPlayerView } from '@server/projection/view-builder';
import { EventBus } from '@engine/event-bus';
import { TriggerManager, discoverTriggers } from '@engine/trigger-manager';
import { CardCharacteristicService } from '@engine/card-characteristic-service';
import { captureSourceInformation } from '@engine/source-information';
import { instantiateCard, instantiateToken } from '@library/card-factory';
import { parseCardDefinition, parseInstructionDefinition } from '@library/card-parser';
import { RawAbilitySchema, NormalizedAbilitySchema } from '../../packages/engine/src/rules/schema/contracts';
import type { CardInstance, CardZone, TriggerEvent, TriggerListener } from '@shared/card.types';
import type { GameMutation } from '@shared/game-mutation.types';
import type { GameEvent } from '@shared/game-event.types';
import { capture, publicVisibility, windowGame } from '../helpers/card-window-fixture';
import { createTestRoom } from '../helpers/test-room-factory';

const life = { family: 'resources', operation: 'adjust_life', params: { amount: 2 } };
function ability(listener: TriggerListener, triggerCondition: TriggerEvent = 'ON_DISCARD_FROM_LIBRARY', extra = {}) {
  return { id: 'response', type: 'triggered', triggerCondition, trigger: { listener }, effect: life, ...extra };
}
function card(zone: CardZone, abilities: unknown[] = []): CardInstance {
  const instance = instantiateCard('empire-servant');
  instance.blueprint = parseCardDefinition({
    schemaVersion: 1,
    id: 'listener-fixture',
    cardTypes: ['Creature'],
    power: 1,
    toughness: 3,
    abilities,
  });
  instance.state = { ...instance.state, zone, ownerId: 'player1', controllerId: 'player1', zoneRevision: 4 };
  return instance;
}
const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function start() {
  const room = createTestRoom();
  room.players.player1.hand = [];
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return engine;
}
const beforeLibrary: TriggerListener = { kind: 'event_card', state: 'before', zones: ['library'] };
const watcher: TriggerListener = { kind: 'watcher', activeZones: ['battlefield'] };

describe('strict trigger listener contract', () => {
  it.each([beforeLibrary, watcher])('parses and preserves %j through the shared card parser', (listener) => {
    const source = card('library', [ability(listener)]);
    expect(source.blueprint.abilities[0]).toMatchObject({ trigger: { listener } });
    expect(NormalizedAbilitySchema.safeParse(source.blueprint.abilities[0]).success).toBe(true);
  });
  it.each([
    { kind: 'event_card', state: 'before', zones: ['library'], activeZones: ['hand'] },
    { kind: 'watcher', activeZones: ['hand'], state: 'before' },
    { kind: 'event_card', zones: ['hand'] },
    { kind: 'watcher', activeZones: [] },
    { kind: 'watcher', activeZones: ['hand', 'hand'] },
    { kind: 'watcher', activeZones: ['limbo'] },
    { kind: 'subscription', activeZones: ['hand'] },
  ])('rejects invalid or mixed listener fields %j', (listener) => {
    expect(() => card('hand', [ability(listener as TriggerListener)])).toThrow();
  });
  it.each(['another', 'any'])('rejects event_card subject %s in raw and normalized schemas', (subject) => {
    const raw = ability(beforeLibrary, 'ON_DISCARD_FROM_LIBRARY', { trigger: { listener: beforeLibrary, subject } });
    expect(RawAbilitySchema.safeParse(raw).success).toBe(false);
    const normalized = {
      ...raw,
      castSpeed: 'instant',
      effect: { action: 'MODIFY_LIFE', params: { amount: 2 }, targeting: { type: 'self', required: false } },
    };
    expect(NormalizedAbilitySchema.safeParse(normalized).success).toBe(false);
  });
  it.each(['ON_SHUFFLE', 'BEGIN_UPKEEP', 'END_OF_TURN', 'ON_LIFE_GAIN', 'ON_LIFE_LOSS', 'COMBAT_DAMAGE'] as const)(
    'rejects event_card on player/batch event %s',
    (event) => {
      expect(() => card('hand', [ability(beforeLibrary, event)])).toThrow();
    },
  );
  it('rejects source discovery policies on independent delayed registrations', () => {
    expect(() =>
      parseInstructionDefinition({
        family: 'triggers',
        operation: 'delay',
        params: { ability: ability(watcher, 'ON_LIFE_LOSS') },
      }),
    ).toThrow(/Delayed registrations/);
  });
});

describe('event card and watcher discovery through the real mutation pipeline', () => {
  it.each(['before', 'after'] as const)(
    'uses the %s mill snapshot, retains identity and survives JSON recovery',
    (state) => {
      const engine = start();
      const source = card('library', [
        ability({ kind: 'event_card', state, zones: [state === 'before' ? 'library' : 'graveyard'] }),
      ]);
      engine.roomState.players.player1.deck = [source];
      engine.applyMutations([
        {
          type: 'MOVE_CARD',
          cardUuid: source.uuid,
          playerId: 'player1',
          from: 'library',
          to: 'graveyard',
          reason: 'discard',
        },
      ]);
      expect(engine.roomState.stack).toHaveLength(1);
      const object = engine.roomState.stack[0];
      expect(object.source.state.zone).toBe(state === 'before' ? 'library' : 'graveyard');
      expect(object.sourceInfo?.card.state.zoneRevision).toBe(state === 'before' ? 4 : 5);
      expect(object.triggeringEvent).toMatchObject({
        subject: {
          before: { cardUuid: source.uuid, zone: 'library', zoneRevision: 4 },
          after: { cardUuid: source.uuid, zone: 'graveyard', zoneRevision: 5 },
        },
      });
      expect(engine.roomState.players.player1.graveyard.map((c) => c.uuid)).toEqual([source.uuid]);
      const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState)));
      restored.initRoom();
      engines.push(restored);
      restored.resolveTopOfStack();
      expect(restored.roomState.players.player1.life).toBe(22);
    },
  );
  it('does not treat other milled cards or the wrong selected zone as the listener', () => {
    const engine = start();
    const waiting = card('library', [ability(beforeLibrary)]);
    const milled = card('library', [ability({ kind: 'event_card', state: 'after', zones: ['library'] })]);
    engine.roomState.players.player1.deck = [waiting, milled];
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
    expect(engine.roomState.stack).toEqual([]);
  });
  it('handles its own discard from hand without implicitly enabling every hand ability', () => {
    const engine = start();
    const source = card('hand', [
      ability({ kind: 'event_card', state: 'before', zones: ['hand'] }, 'ON_DISCARD_FROM_HAND'),
    ]);
    const implicit = card('hand', [
      { id: 'old', type: 'triggered', triggerCondition: 'ON_DISCARD_FROM_HAND', effect: life },
    ]);
    engine.roomState.players.player1.hand = [source, implicit];
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: source.uuid,
        playerId: 'player1',
        from: 'hand',
        to: 'graveyard',
        reason: 'discard',
      },
    ]);
    expect(engine.roomState.stack.map((object) => object.source.uuid)).toEqual([source.uuid]);
  });
  it.each(['hand', 'graveyard', 'library', 'exile', 'battlefield'] as const)(
    'finds a watcher in declared %s, with existing subject/controller predicates',
    (zone) => {
      const engine = start();
      const listener = card(zone, [ability({ kind: 'watcher', activeZones: [zone] }, 'ON_LIFE_LOSS')]);
      const list =
        zone === 'battlefield'
          ? engine.roomState.battlefield
          : zone === 'library'
            ? engine.roomState.players.player1.deck
            : zone === 'exile'
              ? (engine.roomState.players.player1.exile = [])
              : engine.roomState.players.player1[zone];
      list.push(listener);
      engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player2', amount: 19 }]);
      expect(engine.roomState.stack).toHaveLength(0);
      engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 19 }]);
      expect(engine.roomState.stack.map((object) => object.source.uuid)).toEqual([listener.uuid]);
    },
  );
  it.each(['hand', 'library'] as const)(
    'does not reveal a hidden %s watcher or unrelated cards through stack projection',
    (zone) => {
      const engine = start();
      const listener = card(zone, [ability({ kind: 'watcher', activeZones: [zone] }, 'ON_LIFE_LOSS')]);
      const unrelated = card(zone);
      const list = zone === 'hand' ? engine.roomState.players.player1.hand : engine.roomState.players.player1.deck;
      list.push(listener, unrelated);
      const before = JSON.stringify([listener.state, unrelated.state]);
      engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 19 }]);
      const opponent = buildPlayerView(engine.roomState, 'player2');
      expect(opponent.stack).toHaveLength(1);
      expect(opponent.stack[0].source).toBeNull();
      expect(JSON.stringify(opponent)).not.toContain(listener.uuid);
      expect(JSON.stringify(opponent)).not.toContain(unrelated.uuid);
      expect(JSON.stringify([listener.state, unrelated.state])).toBe(before);
      const owner = buildPlayerView(engine.roomState, 'player1');
      if (zone === 'hand') expect(owner.stack[0].source).not.toBeNull();
      else expect(owner.stack[0].source).toBeNull();
    },
  );
  it('never falls back to the old battlefield scan for an explicit hand watcher', () => {
    const engine = start();
    engine.roomState.battlefield.push(
      card('battlefield', [ability({ kind: 'watcher', activeZones: ['hand'] }, 'ON_LIFE_LOSS')]),
    );
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 19 }]);
    expect(engine.roomState.stack).toEqual([]);
  });
  it('keeps event subjects separate from watcher and cause and shares the same condition evaluator', () => {
    const engine = start();
    const watch = card('graveyard', [
      ability({ kind: 'watcher', activeZones: ['graveyard'] }, 'ON_DISCARD_FROM_LIBRARY', {
        trigger: {
          listener: { kind: 'watcher', activeZones: ['graveyard'] },
          subject: 'another',
          controller: 'self',
          condition: { op: 'eq', left: { path: 'event.subject.before.zone' }, right: 'library' },
        },
      }),
    ]);
    const subject = card('library');
    engine.roomState.players.player1.graveyard = [watch];
    engine.roomState.players.player1.deck = [subject];
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: subject.uuid,
        playerId: 'player1',
        from: 'library',
        to: 'graveyard',
        reason: 'discard',
      },
    ]);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.roomState.stack[0].source.uuid).toBe(watch.uuid);
    expect(engine.roomState.stack[0].triggeringEvent?.subject?.before?.cardUuid).toBe(subject.uuid);
  });
  it('supports last-known token death before, with no invented after-zone occupant', () => {
    const engine = start();
    const token = instantiateToken('token-angel-1-1', 'player1');
    token.blueprint = card('battlefield', [
      ability({ kind: 'event_card', state: 'before', zones: ['battlefield'] }, 'ON_DIE'),
      ability({ kind: 'event_card', state: 'after', zones: ['graveyard'] }, 'ON_DIE', { id: 'after' }),
    ]).blueprint;
    engine.roomState.battlefield = [token];
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: token.uuid,
        playerId: 'player1',
        from: 'battlefield',
        to: 'graveyard',
        reason: 'destroy',
      },
    ]);
    expect(engine.roomState.players.player1.graveyard).toEqual([]);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.roomState.stack[0].ability?.id).toBe('response');
    expect(engine.roomState.stack[0].triggeringEvent?.subject?.after).toBeUndefined();
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(22);
  });
  it('uses the native before window for departure watchers, including simultaneous sources', () => {
    const engine = start();
    const departing = card('battlefield', [
      ability(watcher, 'ON_DIE', { trigger: { listener: watcher, subject: 'self' } }),
    ]);
    engine.roomState.battlefield = [departing];
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: departing.uuid,
        playerId: 'player1',
        from: 'battlefield',
        to: 'graveyard',
        reason: 'destroy',
      },
    ]);
    expect(engine.roomState.stack.map((object) => object.source.uuid)).toEqual([departing.uuid]);
  });
  it('finds off-board granted watchers, with separate origin-qualified identities', () => {
    const engine = start();
    const source = card('hand');
    engine.roomState.players.player1.hand = [source];
    const granted = card('hand', [ability({ kind: 'watcher', activeZones: ['hand'] }, 'ON_LIFE_LOSS')]).blueprint
      .abilities[0];
    for (const id of ['grant-a', 'grant-b'])
      engine.roomState.continuousEffectPool.push({
        id,
        source: 'global',
        sourceControllerId: 'player1',
        layer: 6,
        duration: 'PERMANENT',
        origin: 'resolved',
        requiredZone: null,
        scope: { cardUuid: source.uuid, zones: ['hand'] },
        effect: { type: 'ABILITY', add: [granted] },
      });
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 19 }]);
    expect(CardCharacteristicService.resolveAbilities(engine.roomState, source)).toHaveLength(2);
    const choice = engine.roomState.pendingChoice;
    expect(choice?.kind).toBe('ordering');
    if (!choice || !('options' in choice)) throw new Error('Expected trigger ordering');
    expect(
      engine.executePlayerAction('player1', 'choose', {
        choiceId: choice.id,
        choices: choice.options.map((option) => option.id),
      }).success,
    ).toBe(true);
    expect(engine.roomState.stack).toHaveLength(2);
    expect(new Set(engine.roomState.stack.map((object) => object.ability?.id)).size).toBe(2);
  });
  it('combines shared-per-event copies through the same evaluator', () => {
    const engine = start();
    engine.roomState.players.player1.hand = [0, 1].map(() =>
      card('hand', [ability({ kind: 'watcher', activeZones: ['hand'] }, 'ON_LIFE_LOSS', { sharedPerEvent: true })]),
    );
    engine.applyMutations([{ type: 'SET_LIFE', playerId: 'player1', amount: 19 }]);
    expect(engine.roomState.stack).toHaveLength(1);
  });
  it('does not discover an event-card ability removed in its selected window', () => {
    const engine = start();
    const source = card('library', [ability(beforeLibrary)]);
    engine.roomState.players.player1.deck = [source];
    engine.roomState.continuousEffectPool.push({
      id: 'silence',
      source: 'global',
      layer: 6,
      duration: 'PERMANENT',
      origin: 'resolved',
      requiredZone: null,
      scope: { cardUuid: source.uuid, zones: ['library'] },
      effect: { type: 'ABILITY', removeAll: true },
    });
    engine.applyMutations([
      {
        type: 'MOVE_CARD',
        cardUuid: source.uuid,
        playerId: 'player1',
        from: 'library',
        to: 'graveyard',
        reason: 'discard',
      },
    ]);
    expect(engine.roomState.stack).toEqual([]);
  });
  it('retains a real reveal observation when the same resolution later mills the card', () => {
    const source = card('library', [ability(beforeLibrary, 'ON_REVEAL')]);
    const { engine } = windowGame(
      [
        capture({ amount: 1, visibility: publicVisibility, event: 'revealed' }),
        { family: 'cards', operation: 'mill', params: { amount: 1 } },
      ],
      [source],
    );
    engines.push(engine);
    engine.resolveTopOfStack();
    const event = engine
      .drainEventBatches()
      .flatMap((batch) => batch.events)
      .find((event) => event.eventId === 'CARD_REVEALED');
    expect(event?.payload.revealedSnapshot.card.state.zone).toBe('library');
    expect(engine.roomState.players.player1.graveyard[0].uuid).toBe(source.uuid);
    expect(engine.roomState.stack).toHaveLength(1);
    expect(engine.roomState.stack[0].sourceInfo?.card.state.zoneRevision).toBe(4);
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(22);
  });
  it('shares once-per-turn reservation across two events rather than reserving in discovery', () => {
    const engine = start();
    const listener = card('hand', [
      ability({ kind: 'watcher', activeZones: ['hand'] }, 'ON_LIFE_LOSS', { limitPerTurn: 1 }),
    ]);
    engine.roomState.players.player1.hand = [listener];
    engine.applyMutations([
      { type: 'SET_LIFE', playerId: 'player1', amount: 19 },
      { type: 'SET_LIFE', playerId: 'player1', amount: 18 },
    ]);
    expect(engine.roomState.stack).toHaveLength(1);
  });
});

describe('retained event subject identity and discovery deduplication', () => {
  it('does not bind a damage dealer to a later incarnation', () => {
    const room = createTestRoom();
    const old = card('battlefield', [
      ability({ kind: 'event_card', state: 'before', zones: ['battlefield'] }, 'ON_DAMAGE_DEALT'),
    ]);
    room.battlefield = [old];
    const retained = captureSourceInformation(room, old);
    const later = structuredClone(old);
    later.state.zoneRevision = 6;
    room.battlefield = [later];
    const event: GameEvent = {
      eventId: 'DAMAGE_DEALT',
      roomId: room.roomId,
      payload: { card: retained.card, snapshot: retained, controllerId: 'player1' },
    };
    const pending = discoverTriggers(event, {
      room,
      roomId: room.roomId,
      battlefield: room.battlefield,
      before: room,
      after: room,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].source.state.zoneRevision).toBe(4);
    expect(pending[0].event.subject?.after).toBeUndefined();
  });
  it('uses the observed reveal snapshot even if the card has since changed zones', () => {
    const before = createTestRoom();
    const original = card('library', [
      ability(beforeLibrary, 'ON_REVEAL', {
        trigger: {
          listener: beforeLibrary,
          cardTypes: ['Creature'],
          condition: { op: 'eq', left: { path: 'source.power' }, right: 1 },
        },
      }),
    ]);
    before.players.player1.deck = [original];
    const revealedSnapshot = captureSourceInformation(before, original);
    const room = structuredClone(before);
    room.players.player1.deck = [];
    const later = structuredClone(original);
    later.state.zone = 'hand';
    later.state.zoneRevision = 5;
    later.blueprint = { ...later.blueprint, cardTypes: ['Artifact'], power: 10 };
    room.players.player1.hand = [later];
    const pending = discoverTriggers(
      {
        eventId: 'CARD_REVEALED',
        roomId: room.roomId,
        payload: { card: later, revealedCard: original, revealedSnapshot, controllerId: 'player1' },
      },
      { room, roomId: room.roomId, battlefield: [], before: room, after: room },
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].source.state.zone).toBe('library');
    expect(pending[0].event.subject?.after?.zoneRevision).toBe(4);
  });
  it('keeps independently registered delayed listeners separate from each other', () => {
    const room = createTestRoom();
    const source = card('battlefield', [
      { id: 'delayed', type: 'triggered', triggerCondition: 'ON_LIFE_LOSS', effect: life },
    ]);
    room.battlefield = [];
    const info = captureSourceInformation(room, source);
    const definition = source.blueprint.abilities[0];
    if (definition.type !== 'triggered') throw new Error('Expected trigger');
    room.delayedTriggers = ['registration-a', 'registration-b'].map((id) => ({
      id,
      source,
      sourceInfo: info,
      controllerId: 'player1',
      ability: definition,
      lifetime: 'once',
    }));
    const bus = new EventBus(room.roomId),
      collector: GameMutation[] = [];
    const manager = new TriggerManager(
      bus,
      collector,
      () => 'queued',
      () => room,
    );
    bus.emit({
      eventId: 'LIFE_LOST',
      roomId: room.roomId,
      eventUuid: 'shared-event',
      payload: { playerId: 'player1', amount: 1 },
    });
    expect(collector.filter((m) => m.type === 'PUSH_STACK')).toHaveLength(2);
    expect(collector.filter((m) => m.type === 'REMOVE_DELAYED_TRIGGER')).toHaveLength(2);
    manager.dispose(bus);
  });
  it('suppresses duplicate delivery before reserving a use, but accepts another event', () => {
    const room = createTestRoom();
    const source = card('battlefield', [ability(watcher, 'ON_LIFE_LOSS')]);
    room.battlefield = [source];
    const bus = new EventBus(room.roomId),
      collector: GameMutation[] = [];
    const manager = new TriggerManager(
      bus,
      collector,
      () => 'queued',
      () => room,
    );
    const event: GameEvent = {
      eventId: 'LIFE_LOST',
      roomId: room.roomId,
      eventUuid: 'one-event',
      payload: { controllerId: 'player1', amount: 1 },
    };
    bus.emit(event);
    bus.emit(event);
    expect(collector.filter((m) => m.type === 'PUSH_STACK')).toHaveLength(1);
    expect(collector.filter((m) => m.type === 'RECORD_ABILITY_USE')).toHaveLength(1);
    bus.emit({ ...event, eventUuid: 'another-event' });
    expect(collector.filter((m) => m.type === 'PUSH_STACK')).toHaveLength(2);
    const queued = collector.find((m) => m.type === 'PUSH_STACK');
    if (!queued || queued.type !== 'PUSH_STACK' || queued.stackObject.type !== 'triggered')
      throw new Error('Expected trigger');
    room.triggerQueue = {
      entries: [{ object: JSON.parse(JSON.stringify(queued.stackObject)), selections: {}, ordered: false }],
      resumePriority: 'player1',
    };
    collector.length = 0;
    bus.emit(event);
    expect(collector).toEqual([]);
    manager.dispose(bus);
  });
});
