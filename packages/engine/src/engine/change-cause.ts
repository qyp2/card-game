import { planScorchDestruction } from './mechanics/scorch';
import type { CardInstance } from '../types/card.types';
import type { ChangeCause, KillOutcome } from '../types/change-cause.types';
import type { GameMutation } from '../types/game-mutation.types';
import type { GameRoom } from '../types/game.room.types';
import type { StackObject, StackEffect } from '../types/effect.types';
import type { DamageAssignment } from '../types/damage.types';
import { CardCharacteristicService } from './card-characteristic-service';
import { resolveRoomCharacteristics } from './characteristic-layers';
import { roomCards } from './continuous-effect-state';
import type { ReplacementDefinition } from '../types/proposed-event.types';
import { captureSourceInformation, resolveSourceInformation } from './source-information';

export const causalKey = (card: CardInstance) => `${card.uuid}:${card.state.zoneRevision ?? 0}`;
const unique = (causes: ChangeCause[]) => [...new Map(causes.map((c) => [c.id, c])).values()];
/** Capture the resolving instruction and the event that caused it. */
export function effectCause(room: GameRoom, object: StackObject, effect: StackEffect): ChangeCause {
  const parent = object.type === 'triggered' ? object.triggeringEvent : undefined;
  const id = `${object.uuid}:instruction:${effect.instructionId ?? 0}:${effect.action}`;
  return {
    id,
    rootId: parent?.cause?.rootId ?? id,
    parentId: parent?.cause?.id,
    eventUuid: parent?.eventUuid,
    kind: 'effect',
    source: resolveSourceInformation(room, object),
    controllerId: object.controllerId,
    abilityId: object.type === 'spell' ? undefined : object.ability?.id,
    stackUuid: object.uuid,
    instructionId: effect.instructionId,
    killDestination: effect.onKill?.destination,
  };
}
/** Read the actual damage dealer, retaining an existing causal identity. */
export function damageCause(assignment: DamageAssignment): ChangeCause {
  const id = `damage:${assignment.source.card.uuid}:${assignment.source.card.state.zoneRevision ?? 0}`;
  return (
    assignment.cause ?? {
      id,
      rootId: id,
      kind: assignment.combat ? 'combat' : 'effect',
      source: assignment.source,
      controllerId: assignment.source.card.state.controllerId,
    }
  );
}
/** One dealer identity per actual source, even inside one simultaneous command. */
function causeForSource(base: ChangeCause, source: import('../types/card.types').CardSnapshot): ChangeCause {
  const same =
    base.source?.card.uuid === source.card.uuid &&
    (base.source.card.state.zoneRevision ?? 0) === (source.card.state.zoneRevision ?? 0);
  return {
    ...base,
    id: same ? base.id : `${base.id}:dealer:${causalKey(source.card)}`,
    parentId: same ? base.parentId : base.id,
    source,
    controllerId: source.card.state.controllerId,
  };
}
/** Keep the dealer separate from replacement and parent provenance. */
export function attributeDamage(assignment: DamageAssignment, parent: ChangeCause): DamageAssignment {
  const base = assignment.cause ?? parent;
  return {
    ...assignment,
    cause: {
      ...causeForSource(base, assignment.source),
      kind: assignment.combat ? 'combat' : 'effect',
    },
  };
}
/** Record which replacement changed an event without changing its dealer. */
export function replacementCause(
  room: GameRoom,
  cause: ChangeCause | undefined,
  rule: ReplacementDefinition,
): ChangeCause | undefined {
  if (!cause) return;
  const source = rule.source
    ? roomCards(room).find(
        (c) => c.uuid === rule.source!.cardUuid && (c.state.zoneRevision ?? 0) === rule.source!.zoneRevision,
      )
    : undefined;
  return {
    ...cause,
    modifiers: [
      ...(cause.modifiers ?? []),
      {
        ruleId: rule.id,
        source: source ? captureSourceInformation(room, source) : undefined,
      },
    ],
  };
}
/** Attach causal context to planned mutations and nested damage results. */
export function attributeMutations(mutations: GameMutation[], cause: ChangeCause, room?: GameRoom): GameMutation[] {
  return mutations.map((original) => {
    let legacySource: string | undefined;
    let source: import('../types/card.types').CardSnapshot | undefined;
    if ('sourceInfo' in original) source = original.sourceInfo;
    if (original.type === 'SET_DAMAGE') {
      legacySource = original.source;
      source = original.damageSourceInfo;
    }
    if (original.type === 'SET_LIFE') {
      legacySource = original.damageSource;
      source = original.damageSourceInfo;
    }
    const live = room && legacySource ? roomCards(room).find((card) => card.uuid === legacySource) : undefined;
    if (!source && live && room) source = captureSourceInformation(room, live);
    const m = source && !original.cause ? { ...original, cause: causeForSource(cause, source) } : original;
    return m.type === 'APPLY_DAMAGE_BATCH'
      ? {
          ...m,
          cause: m.cause ?? cause,
          assignments: m.assignments.map((a) => attributeDamage(a, m.cause ?? cause)),
          ...(m.results ? { results: attributeMutations(m.results, cause, room) } : {}),
        }
      : { ...m, cause: m.cause ?? cause };
  });
}
function lethal(
  room: GameRoom,
  card: CardInstance,
  value: ReturnType<typeof CardCharacteristicService.resolve>,
): boolean {
  return (
    value.toughness <= 0 ||
    (!value.keywords.some((k) => k.toLowerCase() === 'indestructible') &&
      (card.state.damageTaken >= value.toughness ||
        !!card.state.deathtouchDamage ||
        !!planScorchDestruction(room, card, value)))
  );
}
/** Pure causal index keyed by current battlefield incarnations; event history remains chronological. */
export function trackCausalChange(before: GameRoom, after: GameRoom, mutation: GameMutation): GameRoom {
  if (
    before.battlefield === after.battlefield &&
    before.continuousEffectPool === after.continuousEffectPool &&
    !['SET_PHASE', 'SET_TURN', 'SET_LIFE', 'CHANGE_LIFE', 'SET_PLAYER_ZONES'].includes(mutation.type)
  )
    return after;
  const fallback = mutation.cause ?? {
    id: `rule:${mutation.type}`,
    rootId: `rule:${mutation.type}`,
    kind: 'rule' as const,
  };
  let changed = false;
  const ledger = { ...before.causalState };
  const present = new Set(after.battlefield.map(causalKey));
  for (const key of Object.keys(ledger))
    if (!present.has(key)) {
      delete ledger[key];
      changed = true;
    }
  const beforeValues = resolveRoomCharacteristics(before),
    afterValues = resolveRoomCharacteristics(after);
  for (const card of after.battlefield) {
    const old = before.battlefield.find((c) => causalKey(c) === causalKey(card));
    const value = afterValues.get(card);

    // Guard: a battlefield card the board evaluation did not cover cannot be
    // attributed. Skipping it is safer than dereferencing a missing value.
    if (!value) continue;

    if (!value.cardTypes.includes('Creature')) continue;
    const previous = old ? beforeValues.get(old) : undefined;
    const health = value.toughness - card.state.damageTaken;
    const oldHealth = previous && old ? previous.toughness - old.state.damageTaken : Infinity;
    const wasLethal = !!old && !!previous && lethal(before, old, previous),
      nowLethal = lethal(after, card, value);
    const scorch = !!after.setup?.scorch && (card.state.counters.scorch ?? 0) > (old?.state.counters.scorch ?? 0);
    const harmful = health < oldHealth || (!wasLethal && nowLethal) || scorch;
    const key = causalKey(card),
      existing = ledger[key];
    if (harmful && (old || health <= 0)) {
      const damage =
        mutation.type === 'APPLY_DAMAGE_BATCH'
          ? mutation.assignments
              .filter((a) => a.amount > 0 && a.recipient.kind === 'permanent' && a.recipient.cardUuid === card.uuid)
              .map(damageCause)
          : [];
      const causes = unique(damage.length ? damage : [fallback]);
      let receipts: import('../types/change-cause.types').ChangeContribution[];
      if (mutation.type === 'APPLY_DAMAGE_BATCH') {
        receipts = mutation.assignments
          .filter(
            (packet) =>
              packet.amount > 0 && packet.recipient.kind === 'permanent' && packet.recipient.cardUuid === card.uuid,
          )
          .map((packet) => ({
            cause: damageCause(packet),
            kind: 'damage',
            amount: packet.amount,
            turnNumber: after.turnNumber ?? 1,
          }));
      } else {
        let kind: import('../types/change-cause.types').ChangeContribution['kind'] = 'state';
        if (previous && value.toughness !== previous.toughness) kind = 'characteristic';
        if (card.state.damageTaken > (old?.state.damageTaken ?? 0)) kind = 'damage';
        let amount = Number.isFinite(oldHealth) ? oldHealth - health : 0;
        if (scorch) amount = (card.state.counters.scorch ?? 0) - (old?.state.counters.scorch ?? 0);
        receipts = causes.map((cause) => ({ cause, kind, amount, turnNumber: after.turnNumber ?? 1 }));
      }
      let lethalCauses: ChangeCause[] | undefined;
      if (nowLethal) lethalCauses = existing?.lethal;
      if (nowLethal && (!wasLethal || !lethalCauses)) lethalCauses = causes;
      ledger[key] = {
        history: [...(existing?.history ?? []), ...receipts],
        contributors: unique([...(existing?.contributors ?? []), ...causes]),
        lethal: lethalCauses,
      };
      changed = true;
    } else if (existing?.lethal && !nowLethal) {
      ledger[key] = { ...existing, lethal: undefined };
      changed = true;
    }
  }
  return changed ? { ...after, causalState: ledger } : after;
}
/** Retain contributors and lethal causes before the victim leaves. */
export function attributedKillOutcome(
  room: GameRoom,
  card: CardInstance,
  reason: KillOutcome['reason'],
  causes?: ChangeCause[],
): KillOutcome {
  const recorded = room.causalState?.[causalKey(card)];
  const credited = unique(causes ?? recorded?.lethal ?? []);
  return {
    victim: { cardUuid: card.uuid, zoneRevision: card.state.zoneRevision ?? 0 },
    reason,
    causes: credited,
    contributors: unique([...(recorded?.contributors ?? []), ...credited]),
    history: recorded?.history ?? [],
  };
}
/** A kill is a committed lethal/destroy departure, independently of its final destination. */
export function killMove(
  room: GameRoom,
  move: Extract<GameMutation, { type: 'MOVE_CARD' }>,
  reason: KillOutcome['reason'],
  causes?: ChangeCause[],
): GameMutation {
  const card = room.battlefield.find((c) => c.uuid === move.cardUuid);
  if (!card || !CardCharacteristicService.resolveTypes(room, card).includes('Creature')) return move;
  const credited = unique(causes ?? room.causalState?.[causalKey(card)]?.lethal ?? (move.cause ? [move.cause] : []));
  const kill = attributedKillOutcome(room, card, reason, credited);
  return {
    ...move,
    cause: move.cause ?? credited[0],
    kill,
    to: credited.some((c) => c.killDestination === 'exile') ? 'exile' : move.to,
  };
}
/** Only explicit killed-outcome instructions request an immediate lethal settlement. */
export function attributedLethalMoves(room: GameRoom, causeId: string): GameMutation[] {
  return room.battlefield.flatMap((card) => {
    const causes = room.causalState?.[causalKey(card)]?.lethal;
    if (!causes?.some((c) => c.id === causeId)) return [];
    const value = CardCharacteristicService.resolve(room, card);
    if (value.toughness > 0 && value.keywords.some((k) => k.toLowerCase() === 'indestructible')) return [];
    if (!lethal(room, card, value)) return [];
    return [
      value.toughness <= 0
        ? killMove(
            room,
            {
              type: 'MOVE_CARD',
              cardUuid: card.uuid,
              playerId: card.state.ownerId,
              from: 'battlefield',
              to: 'graveyard',
            },
            'lethal',
            causes,
          )
        : {
            type: 'DESTROY_CARD' as const,
            cardUuid: card.uuid,
            zoneRevision: card.state.zoneRevision ?? 0,
            cause: causes[0],
            kill: attributedKillOutcome(room, card, 'lethal', causes),
          },
    ];
  });
}
