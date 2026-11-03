import type { TurnHistory } from '../types/trigger.types';
import type { TriggeringEvent } from '../types/effect.types';
import type { CardInstance, ActivatedAbility, TriggeredAbility } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';

/** Every event id that is recorded in per-turn history. */
export const HISTORY_EVENTS = [
  'PERMANENT_ENTERED',
  'PERMANENT_LEFT',
  'PERMANENT_DIED',
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
export const emptyEventCounts = (): Record<string, number> =>
  Object.fromEntries(HISTORY_EVENTS.map((id) => [id, 0]));

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

/** Ability-use key: scoped to the card's current incarnation, not just its UUID. */
export const abilityUseKey = (source: CardInstance, id: string) =>
  `${source.uuid}:${source.state.zoneRevision ?? 0}:${id}`;

/** True when an ability has already been used as often as its per-turn limit allows. */
export function abilityLimitReached(room: GameRoom, source: CardInstance, ability: ActivatedAbility | TriggeredAbility): boolean {
  const limit = ability.limitPerTurn;

  // No limit declared means the ability is unrestricted.
  return limit !== undefined &&
    (!Number.isSafeInteger(limit) ||
      limit < 1 ||
      (room.turnHistory?.uses[abilityUseKey(source, ability.id ?? '')] ?? 0) >= limit);
}

/** Append a rules-relevant event to the turn history, updating both counters. */
export function recordRuleEvent(history: TurnHistory, event: TriggeringEvent): TurnHistory {
  // Guard: only tracked event ids are recorded.
  if (!(HISTORY_EVENTS as readonly string[]).includes(event.eventId)) return history;

  const playerId = event.payload.controllerId ?? event.payload.playerId ?? event.payload.currentPlayer;

  // Per-player counts only exist when the event names a player.
  const own = typeof playerId === 'string' ? history.playerCounts[playerId] ?? emptyEventCounts() : undefined;

  return {
    ...history,
    events: [...history.events, event],
    counts: { ...history.counts, [event.eventId]: (history.counts[event.eventId] ?? 0) + 1 },
    playerCounts: own
      ? {
        ...history.playerCounts,
        [playerId as string]: { ...own, [event.eventId]: (own[event.eventId] ?? 0) + 1 },
      }
      : history.playerCounts,
  };
}
