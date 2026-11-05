export { abilityUseKey } from '../shared/ability-identity';
import { abilityUsageAvailable } from './ability-usage';
import type { TurnHistory } from '../types/trigger.types';
import type { TriggeringEvent } from '../types/effect.types';
import type { CardInstance, ActivatedAbility, TriggeredAbility } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';

/** Every event id that is recorded in per-turn history. */
export const HISTORY_EVENTS = [
  'PERMANENT_ENTERED',
  'PERMANENT_LEFT',
  'PERMANENT_DIED',
  'CREATURE_KILLED',
  'CHARACTERISTICS_CHANGED',
  'PERMANENT_DESTROYED',
  'CARD_DRAWN',
  'LIBRARY_SHUFFLED',
  'CARD_DISCARDED_FROM_HAND',
  'CARD_DISCARDED_FROM_LIBRARY',
  'COUNTER_CHANGED',
  'SPELL_CAST',
  'LIFE_GAINED',
  'LIFE_LOST',
  'DAMAGE_TAKEN',
  'DAMAGE_DEALT',
  'ATTACK_DECLARED',
  'BLOCK_DECLARED',
  'UPKEEP_STARTED',
  'END_STEP_STARTED',
  'COMBAT_DAMAGE_RESOLVED',
] as const;

/** A zeroed counter for every tracked event id. */
export const emptyEventCounts = (): Record<string, number> => Object.fromEntries(HISTORY_EVENTS.map((id) => [id, 0]));

/** Fresh history for a new turn. */
export function newTurnHistory(turnNumber: number): TurnHistory {
  return {
    turnNumber,
    events: [],
    counts: emptyEventCounts(),
    playerCounts: {},
    uses: {},
    landPlays: {},
  };
}

/** Compatibility facade; all budgets and old turn limits share the usage consumer. */
export function abilityLimitReached(
  room: GameRoom,
  source: CardInstance,
  ability: ActivatedAbility | TriggeredAbility,
): boolean {
  return !abilityUsageAvailable(room, source, ability);
}

/** Append a rules-relevant event to the turn history, updating both counters. */
export function recordRuleEvent(history: TurnHistory, event: TriggeringEvent): TurnHistory {
  // Guard: only tracked event ids are recorded.
  if (!(HISTORY_EVENTS as readonly string[]).includes(event.eventId)) return history;

  const playerId = event.payload.controllerId ?? event.payload.playerId ?? event.payload.currentPlayer;

  const players =
    event.eventId === 'CREATURE_KILLED'
      ? [
          ...new Set(
            (event.payload.outcome as import('../types/change-cause.types').KillOutcome).causes.flatMap((c) =>
              c.controllerId ? [c.controllerId] : [],
            ),
          ),
        ]
      : typeof playerId === 'string'
        ? [playerId]
        : [];
  const playerCounts = { ...history.playerCounts };
  for (const player of players) {
    const own = playerCounts[player] ?? emptyEventCounts();
    playerCounts[player] = { ...own, [event.eventId]: (own[event.eventId] ?? 0) + 1 };
  }
  return {
    ...history,
    events: [...history.events, event],
    counts: { ...history.counts, [event.eventId]: (history.counts[event.eventId] ?? 0) + 1 },
    playerCounts,
  };
}
