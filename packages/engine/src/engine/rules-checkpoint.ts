import type { GameRoom } from '../types/game.room.types';
import type { GameMutation } from '../types/game-mutation.types';
import { checkStateBasedActions } from './state-based-actions';

interface CheckpointBoundary {
  getRoom: () => GameRoom;
  apply: (mutations: GameMutation[], kind: 'state-based-action' | 'pending') => GameMutation[];
  takePending: () => GameMutation[];
  getPending?: () => GameMutation[];
  schedule?: () => GameMutation[];
}

/** Settle SBAs before scheduling discovered triggers; repeat until stable or terminal. */
export function runRulesCheckpoint(boundary: CheckpointBoundary): GameMutation[] {
  const applied: GameMutation[] = [];

  // Loop until the room is stable, terminal, or waiting on a player decision.
  while (true) {
    const room = boundary.getRoom();

    // A pending choice suspends the checkpoint; the caller resumes it later.
    if (room.pendingChoice) return applied;

    // Terminal states discard anything still queued and stop immediately.
    if (room.status === 'gameOver' || room.outcome) {
      boundary.takePending();
      return applied;
    }

    // State-based actions always run first, and must make progress.
    const stateBased = checkStateBasedActions(room, boundary.getPending?.());
    if (stateBased.length) {
      const changes = boundary.apply(stateBased, 'state-based-action');
      if (!changes.length) throw new Error('State-based actions made no progress');
      applied.push(...changes);
      continue;
    }

    // Then drain anything the previous step queued.
    const pending = boundary.takePending();
    if (!pending.length) {
      // Nothing queued: ask for newly discovered triggers. An empty answer means
      // the room has settled.
      const scheduled = boundary.schedule?.() ?? [];
      if (!scheduled.length) return applied;
      applied.push(...scheduled);
      continue;
    }

    applied.push(...boundary.apply(pending, 'pending'));
  }
}
