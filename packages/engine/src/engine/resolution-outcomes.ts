import type { GameRoom } from '../types/game.room.types';
import type { GameMutation } from '../types/game-mutation.types';
import type { OutcomeDefinition, OutcomeProbe, StackObject } from '../types/effect.types';
import { gameReducer } from './game-reducer';
import { roomCards } from './continuous-effect-state';

/** Remember only the objects this instruction attempted, before replacements run. */
export function probeOutcome(room: GameRoom, definition: OutcomeDefinition | undefined, produced: GameMutation[]): OutcomeProbe | undefined {
  // Guard: nothing to probe when the instruction declares no outcome.
  if (!definition) return;

  // Collect the card UUIDs the mutations targeted, matching the outcome kind.
  const ids = produced.flatMap((mutation) =>
    definition.kind === 'killed' && ('cardUuid' in mutation || mutation.type === 'ADD_CONTINUOUS_EFFECT' || mutation.type === 'APPLY_DAMAGE_BATCH') ? room.battlefield.map(c => c.uuid) :
    definition.kind === 'destroyed' && mutation.type === 'DESTROY_CARD' ||
    definition.kind === 'discarded' && mutation.type === 'MOVE_CARD' && mutation.reason === 'discard'
      ? [mutation.cardUuid]
      : []);

  // Snapshot the exact incarnations so a later zone change cannot be mistaken
  // for the same object.
  return {
    ...definition,
    cards: roomCards(room)
      .filter((card) => ids.includes(card.uuid))
      .map((card) => ({ cardUuid: card.uuid, zoneRevision: card.state.zoneRevision ?? 0 })),
  };
}

/** Replacements may redirect/cancel: inspect the successful final operation, not intent. */
export function settleOutcome(room: GameRoom, object: StackObject, probe: OutcomeProbe | undefined, mutations: GameMutation[]): StackObject {
  // Guard: no probe means the instruction declared no outcome to settle.
  if (!probe) return object;

  let working = room, succeeded = false;

  // Replay the mutations, looking for the card actually arriving in the
  // expected destination from the expected incarnation and with the required outcome.
  for (const mutation of mutations) {
    const before = working;
    working = gameReducer(working, mutation);

    // Kill credit follows the attributed lethal/destroy departure; other outcomes require their graveyard reason.
    if (
      mutation.type !== 'MOVE_CARD' ||
      (probe.kind === 'killed' ? !['graveyard', 'exile'].includes(mutation.to) || !mutation.kill || !mutation.kill.causes.some(c => c.stackUuid === object.uuid) : mutation.to !== 'graveyard' ||
      mutation.reason !== (probe.kind === 'destroyed' ? 'destroy' : 'discard'))
    ) {
      continue;
    }

    const old = roomCards(before).find((card) => card.uuid === mutation.cardUuid && card.state.zone === mutation.from);
    const arrived = roomCards(working).find(card => card.uuid === mutation.cardUuid && card.state.zone === mutation.to);

    // The move counts only when it is the same incarnation we probed, and the
    // revision advanced by exactly one.
    if (
      old && arrived &&
      probe.cards.some((card) => card.cardUuid === old.uuid && card.zoneRevision === (old.state.zoneRevision ?? 0)) &&
      (arrived.state.zoneRevision ?? 0) === (old.state.zoneRevision ?? 0) + 1
    ) {
      succeeded = true;
    }
  }

  return { ...object, resolutionOutcomes: { ...object.resolutionOutcomes, [probe.name]: succeeded } };
}
