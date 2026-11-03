// src/engine/handlers/rps-play-handler.ts
import type { ActionHandler, ActionData, ActionResult } from '../action-registry';
import type { GameRoom, PlayerId } from '../../types/game.room.types';
import type { StackObject } from '../../types/effect.types';

const RPS_CARD_IDS = ['rock', 'paper', 'scissors'];

/**
 * Play a Rock-Paper-Scissors card during the RPS phase.
 *
 * This is a simultaneous choice with no response window, so it bypasses the
 * normal priority/stack pipeline (which requires priorityPlayerId, null during
 * RPS). It still exercises the mutation/reducer/delta pipeline.
 */
export const rpsPlayHandler: ActionHandler = {
  validate(room: GameRoom, playerId: PlayerId, action: ActionData): ActionResult {
    // Guard: this action only exists during the opening RPS phase.
    if (room.status !== 'RPS') {
      return { success: false, phase: 'validate', reason: 'Not in RPS phase' };
    }

    // Guard: the action must name the card being played.
    if (!action.cardUuid) {
      return { success: false, phase: 'validate', reason: 'cardUuid required' };
    }

    const card = room.players[playerId]?.hand.find((c) => c.uuid === action.cardUuid);

    // Guard: the card must be in the acting player's hand.
    if (!card) {
      return { success: false, phase: 'validate', reason: 'Card not in hand' };
    }

    // Guard: each player plays exactly once.
    if (room.rpsState.playedCards[playerId]) {
      return { success: false, phase: 'validate', reason: 'Already played' };
    }

    // Guard: only the three RPS cards are legal here.
    if (!RPS_CARD_IDS.includes(card.blueprint.id)) {
      return { success: false, phase: 'validate', reason: 'Not an RPS card' };
    }

    return { success: true };
  },

  propose(room: GameRoom, playerId: PlayerId, action: ActionData): ActionResult {
    const card = room.players[playerId]?.hand.find((c) => c.uuid === action.cardUuid);

    // Guard: the card may have left the hand since validation.
    if (!card) {
      return { success: false, phase: 'propose', reason: 'Card not in hand' };
    }

    // Record the choice and move the card to the graveyard in one batch.
    return {
      success: true,
      mutations: [
        { type: 'SET_RPS_PLAYED_CARD', playerId, card: card.blueprint.id },
        { type: 'MOVE_CARD', cardUuid: card.uuid, playerId, from: 'hand', to: 'graveyard' },
      ],
    };
  },

  resolve(_room: GameRoom, _stackObj: StackObject): ActionResult {
    return { success: true };
  },
};
