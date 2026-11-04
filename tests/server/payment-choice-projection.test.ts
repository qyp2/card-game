import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { parseCardDefinition } from '@library/card-parser';
import { buildPlayerView } from '@server/projection/view-builder';
import { decodeChoiceAnswer } from '@server/projection/choice-view';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));

describe('counter payment projection', () => {
  it.each([false, true])('round-trips opaque allocation handles, resolution=%s', (resolution) => {
    const room = createTestRoom();
    fillTestLibraries(room);
    const source = creature('private-payment-source', 'player1');
    const cost = { removeCounters: [{ from: 'battlefield', counterType: 'charge', amount: 2 }] };
    const draw = {
      family: 'cards',
      operation: 'draw',
      params: { amount: 1 },
      targeting: { type: 'self', required: false },
    };
    source.blueprint = parseCardDefinition({
      schemaVersion: 1,
      id: 'payment-view',
      name: 'Payment Source',
      cardTypes: ['Artifact'],
      abilities: [
        {
          id: 'use',
          type: 'activated',
          cost: resolution ? {} : cost,
          effect: resolution
            ? {
                family: 'resources',
                operation: 'pay_cost',
                params: { cost, then: [draw] },
                targeting: { type: 'self', required: false },
              }
            : draw,
        },
      ],
    });
    source.state.counters.charge = 3;
    room.battlefield = [source];
    const engine = new GameEngine(room);
    engine.initRoom();
    engines.push(engine);
    expect(
      engine.executePlayerAction('player1', 'activate_ability', {
        cardUuid: source.uuid,
        abilityId: 'use',
      }).success,
    ).toBe(true);
    if (resolution) {
      engine.resolveTopOfStack();
      expect(
        engine.executePlayerAction('player1', 'choose', {
          choiceId: engine.roomState.pendingChoice!.id,
          choices: ['yes'],
        }).success,
      ).toBe(true);
    }
    const view = buildPlayerView(engine.roomState, 'player1').pendingChoice!;
    expect(view.kind).toBe('distribution');
    if (view.kind !== 'distribution') throw new Error('Expected payment allocation');
    expect(view.cancellable).toBe(true);
    expect(JSON.stringify(view)).not.toContain(source.uuid);
    expect(view.options[0].limit).toBe(3);
    expect(buildPlayerView(engine.roomState, 'player2').pendingChoice).toEqual({
      kind: 'waiting',
      playerId: 'player1',
    });
    const decoded = decodeChoiceAnswer(engine.roomState, 'player1', {
      choiceId: view.id,
      allocations: { [view.options[0].id]: 2 },
    });
    expect(engine.executePlayerAction('player1', 'choose', decoded).success).toBe(true);
    expect(engine.roomState.battlefield[0].state.counters.charge).toBe(1);
  });
});
