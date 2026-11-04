import { afterEach, describe, expect, it } from 'vitest';
import { gameReducer } from '@engine/game-reducer';
import { observationLimits } from '@rules/observation-policy';
import { GameEngine } from '@engine/game-engine';
import { buildPlayerView } from '@server/projection/view-builder';
import { buildObservationViews } from '@server/projection/observation-view';
import { projectViewDelta } from '@server/projection/delta-projector';
import { SyncService } from '@server/rooms/sync-service';
import { canSeeCard } from '@server/projection/reveal-policy';
import { applyDeltaChanges } from '@client/store/deltaReducer';
import {
  capture,
  privateVisibility,
  publicVisibility,
  windowGame,
  windowCard,
  pause,
  windowSource,
  answerWindow,
} from '../helpers/card-window-fixture';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function start(...args: Parameters<typeof windowGame>) {
  const game = windowGame(...args);
  engines.push(game.engine);
  return game;
}

describe('card observation visibility boundary', () => {
  it('projects private faces and order only to the controller, and public count separately', () => {
    const { engine } = start();
    engine.resolveTopOfStack();
    const own = buildPlayerView(engine.roomState, 'player1');
    const opponent = buildPlayerView(engine.roomState, 'player2');
    expect(own.observations?.active[0]).toMatchObject({ count: 6, ordered: true });
    expect(own.observations?.active[0].cards?.map((c) => c.name)).toEqual([
      'Secret hidden-7',
      'Secret hidden-6',
      'Secret hidden-5',
      'Secret hidden-4',
      'Secret hidden-3',
      'Secret hidden-2',
    ]);
    expect(opponent.observations?.active[0]).toMatchObject({ count: 6, ordered: false });
    expect(opponent.observations?.active[0].cards).toBeUndefined();
    expect(JSON.stringify(opponent)).not.toContain('Secret hidden-');
    for (const view of [own, opponent]) {
      const wire = JSON.stringify(view);
      expect(wire).not.toContain('resolutionResults');
      expect(wire).not.toContain('lastKnownCharacteristics');
      expect(wire).not.toContain('"hidden-7"');
    }
  });
  it('does not disclose a hidden window, even its size or existence in the observation views', () => {
    const { engine } = start([
      capture({ visibility: { faces: [], count: [], order: [], expires: 'resolution_end' } }),
      pause,
    ]);
    engine.resolveTopOfStack();
    for (const id of ['player1', 'player2']) {
      expect(buildPlayerView(engine.roomState, id).observations).toEqual({ active: [], history: [] });
    }
  });
  it('uses fixed zone-owner audiences when looking at an opponent library', () => {
    const { engine } = start(
      [
        capture({
          zonePlayer: 'opponent',
          visibility: {
            faces: ['zone_owner'],
            count: ['zone_owner'],
            order: ['zone_owner'],
            expires: 'resolution_end',
          },
        }),
        pause,
      ],
      undefined,
      'player2',
    );
    engine.resolveTopOfStack();
    expect(buildPlayerView(engine.roomState, 'player1').observations).toEqual({ active: [], history: [] });
    const view = buildPlayerView(engine.roomState, 'player2');
    expect(view.observations?.active[0].cards).toHaveLength(6);
    engine.roomState.stack[0] = { ...engine.roomState.stack[0], controllerId: 'player2' };
    expect(buildPlayerView(engine.roomState, 'player1').observations).toEqual({ active: [], history: [] });
  });
  it('shows a public window to both players while keeping selection authority with its chooser', () => {
    const { engine } = start([
      capture({ visibility: publicVisibility, event: 'revealed' }),
      {
        family: 'cards',
        operation: 'move',
        params: { origin: 'library', destination: 'hand' },
        choice: { kind: 'search', zone: 'library', from: windowSource, min: 1, max: 1 },
      },
    ]);
    engine.resolveTopOfStack();
    const opponent = buildPlayerView(engine.roomState, 'player2');
    expect(opponent.observations?.active[0].cards).toHaveLength(6);
    expect(opponent.pendingChoice).toEqual({ kind: 'waiting', playerId: 'player1' });
    expect(
      engine.executePlayerAction('player2', 'choose', {
        choiceId: engine.roomState.pendingChoice!.id,
        choices: ['hidden-7'],
      }).success,
    ).toBe(false);
  });
  it('hides source order independently of face visibility', () => {
    const { engine } = start([capture({ visibility: { ...publicVisibility, order: [] } }), pause]);
    engine.resolveTopOfStack();
    const room = structuredClone(engine.roomState);
    const before = buildObservationViews(room, 'player2');
    for (const observation of Object.values(room.cardObservations!.active)) observation.members.reverse();
    for (const entry of room.cardObservations!.history) entry.observation.members.reverse();
    expect(buildObservationViews(room, 'player2')).toEqual(before);
    expect(before.active[0].ordered).toBe(false);
  });
  it.each([false, true])("does not leak source order through a chooser's options, captured=%s", (captured) => {
    const { engine } = start([
      ...(captured ? [capture({ visibility: { ...publicVisibility, order: [] } })] : []),
      {
        family: 'cards',
        operation: 'move',
        params: { origin: 'library', destination: 'hand' },
        choice: { kind: 'search', zone: 'library', ...(captured ? { from: windowSource } : {}), min: 0, max: 1 },
      },
    ]);
    engine.resolveTopOfStack();
    const before = buildPlayerView(engine.roomState, 'player1').pendingChoice;
    const request = engine.roomState.pendingChoice!;
    if (request.kind === 'number') throw new Error('Expected card choice');
    request.options = [...request.options].reverse();
    expect(buildPlayerView(engine.roomState, 'player1').pendingChoice).toEqual(before);
  });
  it('does not disclose hidden source order through public reveal events', () => {
    const cards = ['zebra', 'alpha', 'middle'].map((name) => windowCard(name));
    const names = (deck: typeof cards) => {
      const { engine } = start([capture({ visibility: { ...publicVisibility, order: [] }, event: 'revealed' })], deck);
      engine.resolveTopOfStack();
      return engine
        .drainEventBatches()
        .flatMap((batch) => batch.events)
        .filter((event) => event.eventId === 'CARD_REVEALED')
        .map((event) => event.payload.revealedCard.blueprint.name);
    };
    expect(names(cards)).toEqual(names([...cards].reverse()));
    expect(names(cards)).toEqual(['Secret alpha', 'Secret middle', 'Secret zebra']);
  });
  it('records a fresh disclosure snapshot without changing the original captured result', () => {
    const { engine } = start([
      capture(),
      pause,
      {
        family: 'cards',
        operation: 'set_collection_visibility',
        params: { from: windowSource, visibility: publicVisibility },
      },
      pause,
    ]);
    engine.resolveTopOfStack();
    const card = engine.roomState.players.player1.deck[7];
    card.blueprint = { ...card.blueprint, name: 'Changed face' };
    expect(answerWindow(engine, ['no']).success).toBe(true);
    const projected = buildPlayerView(engine.roomState, 'player2');
    expect(projected.observations?.active[0].cards?.some((card) => card.name === 'Changed face')).toBe(true);
    const choice = engine.roomState.pendingChoice!;
    if (choice.continuation.type !== 'resolution') throw new Error('Expected paused resolution');
    const original = choice.continuation.stackObj.resolutionResults!.window.cards[0].before.card;
    expect(original.blueprint.name).toBe('Secret hidden-7');
    expect(buildPlayerView(engine.roomState, 'player1').observations?.history[0].cards?.[0].name).toBe(
      'Secret hidden-7',
    );
  });
  it('exposes a filtered subset without granting faces for the remaining hidden members', () => {
    const cards = [
      windowCard('creature-0'),
      windowCard('artifact-0', 'player1', 'Artifact'),
      windowCard('creature-1'),
      windowCard('artifact-1', 'player1', 'Artifact'),
    ];
    const { engine } = start(
      [
        capture(),
        {
          family: 'cards',
          operation: 'set_collection_visibility',
          params: {
            from: windowSource,
            filter: { cardTypes: ['Artifact'] },
            visibility: { ...publicVisibility, order: [] },
            event: 'revealed',
          },
        },
        pause,
      ],
      cards,
    );
    engine.resolveTopOfStack();
    const view = buildPlayerView(engine.roomState, 'player2');
    expect(view.observations?.active[0].cards?.map((c) => c.name).sort()).toEqual([
      'Secret artifact-0',
      'Secret artifact-1',
    ]);
    expect(JSON.stringify(view)).not.toContain('Secret creature-');
    expect(view.observations?.active[0].ordered).toBe(false);
    answerWindow(engine, ['no']);
    expect(
      engine
        .drainEventBatches()
        .flatMap((b) => b.events)
        .filter((e) => e.eventId === 'CARD_REVEALED'),
    ).toHaveLength(2);
  });
  it("can disclose only a filtered subset's count without publishing its faces or the hidden total", () => {
    const cards = [windowCard('secret-creature'), windowCard('secret-artifact', 'player1', 'Artifact')];
    const { engine } = start(
      [
        capture({ visibility: { ...privateVisibility, count: ['controller'] } }),
        {
          family: 'cards',
          operation: 'set_collection_visibility',
          params: {
            from: windowSource,
            filter: { cardTypes: ['Artifact'] },
            visibility: { faces: [], count: ['all_players'], order: [], expires: 'resolution_end' },
          },
        },
        pause,
      ],
      cards,
    );
    engine.resolveTopOfStack();
    const view = buildPlayerView(engine.roomState, 'player2');
    expect(view.observations?.active[0]).toMatchObject({ count: 1, ordered: false });
    expect(view.observations?.active[0].cards).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('Secret secret-');
  });
  it('retains authorized snapshots on refresh without tracking a selected card into the hand', () => {
    const { engine } = start([
      capture({ visibility: publicVisibility }),
      {
        family: 'cards',
        operation: 'move',
        params: { origin: 'library', destination: 'hand' },
        choice: { kind: 'search', zone: 'library', from: windowSource, min: 1, max: 1 },
      },
    ]);
    engine.resolveTopOfStack();
    answerWindow(engine, ['hidden-7']);
    const restored = new GameEngine(JSON.parse(JSON.stringify(engine.roomState)));
    engines.push(restored);
    restored.initRoom();
    const opponent = buildPlayerView(restored.roomState, 'player2');
    expect(opponent.observations?.active).toEqual([]);
    expect(opponent.observations?.history[0].cards).toHaveLength(6);
    expect(opponent.players.player1.hand).toEqual([]);
    expect(canSeeCard(restored.roomState, 'player2', restored.roomState.players.player1.hand[0])).toBe(false);
    expect(JSON.stringify(opponent.observations)).not.toContain('"hidden-7"');
  });
  it('does not leak private names through projected deltas, notifications or refresh history', () => {
    const { engine } = start();
    const before = structuredClone(engine.roomState);
    engine.drainEventBatches();
    const resolved = engine.resolveTopOfStack();
    if (!resolved.success) throw new Error('Expected resolution');
    const sync = new SyncService({} as never);
    const raw = sync.buildDelta(before, resolved.mutations!, {
      action: 'resolve',
      playerId: 'player1',
      batches: engine.drainEventBatches(),
    });
    const filtered = sync.filterForPlayer(raw, 'player2', engine.roomState);
    expect(JSON.stringify(filtered)).not.toContain('Secret hidden-');
    expect(filtered.notifications).toBeUndefined();
    const reconstructed = applyDeltaChanges(buildPlayerView(before, 'player2'), filtered.changes);
    expect(reconstructed).toEqual(buildPlayerView(engine.roomState, 'player2'));
    answerWindow(engine, ['no']);
    expect(JSON.stringify(buildPlayerView(engine.roomState, 'player2'))).not.toContain('Secret hidden-');
  });
  it('projects visibility changes using the same policy for both snapshots and deltas', () => {
    const { engine } = start();
    const before = structuredClone(engine.roomState);
    engine.resolveTopOfStack();
    for (const viewer of ['player1', 'player2']) {
      const delta = projectViewDelta(before, engine.roomState, viewer, { seq: 1, timestamp: 1 });
      expect(applyDeltaChanges(buildPlayerView(before, viewer), delta.changes)).toEqual(
        buildPlayerView(engine.roomState, viewer),
      );
    }
  });
  it("does not let private observations evict or count against another player's history", () => {
    const { engine } = start([capture({ amount: 1, visibility: publicVisibility }), pause]);
    engine.resolveTopOfStack();
    let room = structuredClone(engine.roomState);
    const expected = buildObservationViews(room, 'player2').history;
    const original = Object.values(room.cardObservations!.active)[0];
    const audience = { faces: ['player1'], count: ['player1'], order: ['player1'] };
    const privateObservation = {
      ...original,
      emptyAudience: audience,
      members: original.members.map((member) => ({ ...member, audience })),
    };
    for (let index = 0; index < observationLimits.historyLimit + 2; index++) {
      room = gameReducer(room, {
        type: 'RECORD_CARD_OBSERVATION',
        observation: privateObservation,
        sequence: room.cardObservations!.sequence + 1,
      });
    }
    expect(buildObservationViews(room, 'player2').history).toEqual(expected);
    expect(buildObservationViews(room, 'player1').history).toHaveLength(observationLimits.historyLimit);
  });
  it('rechecks visibility for an already parked choice and rejects a revoked answer', () => {
    const { engine } = start([
      capture(),
      {
        family: 'cards',
        operation: 'move',
        params: { origin: 'library', destination: 'hand' },
        choice: { kind: 'search', zone: 'library', from: windowSource, min: 1, max: 1 },
      },
    ]);
    engine.resolveTopOfStack();
    const original = Object.values(engine.roomState.cardObservations!.active)[0];
    const audience = { faces: [], count: [], order: [] };
    engine.applyMutations([
      {
        type: 'RECORD_CARD_OBSERVATION',
        sequence: engine.roomState.cardObservations!.sequence + 1,
        observation: {
          ...original,
          emptyAudience: audience,
          members: original.members.map((member) => ({ ...member, audience })),
        },
      },
    ]);
    expect(buildPlayerView(engine.roomState, 'player1').pendingChoice).toEqual({
      kind: 'waiting',
      playerId: 'player1',
    });
    expect(answerWindow(engine, ['hidden-7']).success).toBe(false);
    expect(engine.roomState.players.player1.hand).toEqual([]);
  });
  it('keeps base hand/library visibility independent of a stale nested card reference', () => {
    const { engine } = start();
    const hidden = engine.roomState.players.player1.deck[0];
    expect(canSeeCard(engine.roomState, 'player1', hidden)).toBe(false);
    expect(canSeeCard(engine.roomState, 'player2', hidden)).toBe(false);
    const forged = {
      ...hidden,
      state: { ...hidden.state, zone: 'battlefield' as const, visibility: 'public' as const },
    };
    expect(canSeeCard(engine.roomState, 'player2', forged)).toBe(false);
  });
});
