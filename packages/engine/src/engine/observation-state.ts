import type { GameRoom } from '../types/game.room.types';
import type { CardObservation } from '../types/card-observation.types';
import { observationLimits, observationHasAudience } from '../shared/observation-policy';

/** Commit a monotonic, replay-safe exposure revision and retain its immutable authorized history. */
export function recordCardObservation(room: GameRoom, observation: CardObservation, sequence: number): GameRoom {
  const old = room.cardObservations ?? { sequence: 0, active: {}, history: [] };
  if (!Number.isSafeInteger(sequence) || sequence <= 0 || sequence !== old.sequence + 1) return room;
  const snapshot = structuredClone(observation);
  const entries = [...old.history, { sequence, observation: snapshot }];
  const retained = new Set<number>();
  // A private observation cannot evict another player's legitimate history or disclose a private revision count.
  for (const playerId of [room.player1Id, room.player2Id]) {
    if (!playerId) continue;
    const visible = entries.filter((entry) => observationHasAudience(entry.observation, playerId));
    for (const entry of visible.slice(-observationLimits.historyLimit)) retained.add(entry.sequence);
  }
  return {
    ...room,
    cardObservations: {
      sequence,
      active: { ...old.active, [observation.id]: snapshot },
      history: entries.filter((entry) => retained.has(entry.sequence)),
    },
  };
}

/** Close temporary grants while retaining snapshots already legitimately observed by their audiences. */
export function closeCardObservations(room: GameRoom, ownerStackUuid?: string): GameRoom {
  if (!room.cardObservations) return room;
  const active = Object.fromEntries(
    Object.entries(room.cardObservations.active).filter(
      ([, observation]) => ownerStackUuid !== undefined && observation.ownerStackUuid !== ownerStackUuid,
    ),
  );
  if (Object.keys(active).length === Object.keys(room.cardObservations.active).length) return room;
  return { ...room, cardObservations: { ...room.cardObservations, active } };
}
