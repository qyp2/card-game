import { GameEngine } from '@engine/game-engine';
import { buildStackEffects } from '@engine/effect-resolver';
import { parseCardDefinition } from '@library/card-parser';
import { createTestRoom, fillTestLibraries } from './test-room-factory';
import { creature } from './combat-fixture';
import type { CardInstance } from '@shared/card.types';

export const privateVisibility = {
  faces: ['controller'],
  count: ['all_players'],
  order: ['controller'],
  expires: 'resolution_end',
};
export const publicVisibility = {
  faces: ['all_players'],
  count: ['all_players'],
  order: ['all_players'],
  expires: 'resolution_end',
};
export const windowSource = { kind: 'result', name: 'window' };
export const pause = { family: 'cards', operation: 'draw', params: { amount: 1 }, choice: { kind: 'optional' } };
export function capture(params: Record<string, unknown> = {}) {
  return {
    family: 'cards',
    operation: 'capture_window',
    recordResult: { name: 'window', kind: 'captured' },
    params: { zone: 'library', position: 'top', amount: 6, visibility: privateVisibility, ...params },
  };
}
export function windowCard(id: string, owner = 'player1', cardType = 'Creature'): CardInstance {
  const card = creature(id, owner);
  card.state.zone = 'library';
  card.blueprint = {
    ...card.blueprint,
    id: 'definition-' + cardType.toLowerCase(),
    name: 'Secret ' + id,
    cardTypes: [cardType as 'Creature'],
    subTypes: [],
    abilities: [],
  };
  return card;
}
export function windowGame(
  effects: unknown[] = [capture(), pause],
  cards?: CardInstance[],
  owner = 'player1',
  countered = false,
) {
  const room = createTestRoom();
  fillTestLibraries(room, 8);
  const source = creature('window-source', 'player1');
  source.blueprint = parseCardDefinition({
    schemaVersion: 1,
    id: 'window-source',
    name: 'Window Source',
    cardTypes: ['Artifact'],
    onCastEffects: effects,
  });
  room.battlefield = [source];
  room.players.player1.hand = [];
  room.players[owner].deck = cards ?? Array.from({ length: 8 }, (_, i) => windowCard('hidden-' + i, owner));
  const engine = new GameEngine(room);
  engine.initRoom();
  engine.applyMutations([
    {
      type: 'PUSH_STACK',
      stackObject: {
        uuid: 'window-effect',
        type: 'triggered',
        source,
        controllerId: 'player1',
        countered,
        effects: buildStackEffects(source.blueprint.onCastEffects, 'player1', source),
      },
    },
  ]);
  return { engine, source };
}
export function answerWindow(engine: GameEngine, choices: string[]) {
  const choice = engine.roomState.pendingChoice!;
  return engine.executePlayerAction(choice.playerId, 'choose', { choiceId: choice.id, choices });
}
