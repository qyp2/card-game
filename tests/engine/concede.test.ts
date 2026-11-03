import { describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';

describe('concession', () => {
  it.each(['playing', 'RPS'] as const)('ends %s without priority and clears pending rules work', status => {
    const room = createTestRoom({ status, priorityPlayerId: 'player2' }); fillTestLibraries(room);
    room.pendingChoice = { id: 'choice', playerId: 'player2', kind: 'optional', prompt: 'Wait', min: 1, max: 1,
      options: [], continuation: { type: 'trigger', field: 'order' } };
    const engine = new GameEngine(room); engine.initRoom();
    try {
      expect(engine.executePlayerAction('intruder', 'concede').success).toBe(false);
      expect(engine.executePlayerAction('player1', 'concede').success).toBe(true);
      expect(engine.roomState.outcome).toEqual({ type: 'win', winnerId: 'player2', losses: [{ playerId: 'player1', reason: 'concede' }] });
      expect(engine.roomState.pendingChoice).toBeNull(); expect(engine.roomState.stack).toEqual([]);
      expect(engine.executePlayerAction('player2', 'concede').success).toBe(false);
    } finally { engine.dispose(); }
  });
});
