import { describe, expect, it, vi } from 'vitest';
import { hasLegalNonPassAction } from '@engine/legal-actions';
import { GameEngine } from '@engine/game-engine';
import { parseCardDefinition } from '@library/card-parser';
import { abilityUseKey, newTurnHistory } from '@engine/turn-history';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import { creature } from '../helpers/combat-fixture';
import type { GameRoom } from '@shared/game.room.types';

const gain = { action: 'MODIFY_LIFE', params: { amount: 1 } };
const enemy = { type: 'permanent', controller: 'opponent', cardTypes: ['Creature'], required: true };
function room(): GameRoom {
  const state = createTestRoom({ phase: 'stateMainPhase', priorityPlayerId: 'player1', activeTurnPlayerId: 'player1' });
  fillTestLibraries(state); state.players.player1.hand = []; state.battlefield = [];
  state.turnHistory = newTurnHistory(state.turnNumber ?? 1);
  state.players.player1.mana = { white: 0, blue: 0, black: 0, red: 0, green: 0, yellow: 0 };
  return state;
}
let nextCard = 0;
function card(state: GameRoom, extra: Record<string, unknown> = {}, zone: 'hand' | 'battlefield' = 'hand') {
  const source = creature('source-' + nextCard++, 'player1');
  source.blueprint = parseCardDefinition({ schemaVersion: 1, id: source.uuid, cardTypes: ['Spell'], onCastEffects: [gain], ...extra });
  source.state.zone = zone;
  if (zone === 'hand') state.players.player1.hand.push(source); else state.battlefield.push(source);
  return source;
}
function ability(state: GameRoom, extra = {}) {
  return card(state, { cardTypes: ['Creature'], power: 1, toughness: 2,
    abilities: [{ id: 'use', type: 'activated', effect: gain, ...extra }] }, 'battlefield');
}
function freeze(value: any): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.values(value).forEach(freeze); Object.freeze(value);
}
function witnessExecutes(state: GameRoom) {
  const result = hasLegalNonPassAction(state, 'player1'); expect(result.kind).toBe('available');
  if (result.kind !== 'available') throw new Error('Expected a witness');
  const engine = new GameEngine(structuredClone(state)); engine.initRoom();
  try { expect(engine.executePlayerAction('player1', result.action.actionId, result.action.data).success).toBe(true); }
  finally { engine.dispose(); }
  return result;
}

describe('pure non-pass action availability', () => {
  it('proves none in an empty priority window, including a stack response window', () => {
    const state = room(); expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'none' });
    state.stack.push({ uuid: 'stack', type: 'triggered', source: creature('other', 'player2'), controllerId: 'player2', effects: [], countered: false });
    expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'none' });
  });
  it('returns a usable witness for a free spell and leaves input, randomness and clocks untouched', () => {
    const state = room(); card(state); const before = JSON.stringify(state); freeze(state);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock'); });
    try {
      expect(hasLegalNonPassAction(state, 'player1').kind).toBe('available');
      expect(hasLegalNonPassAction(state, 'player1')).toEqual(hasLegalNonPassAction(state, 'player1'));
      expect(JSON.stringify(state)).toBe(before); expect(random).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled();
    } finally { random.mockRestore(); now.mockRestore(); }
    witnessExecutes(state);
  });
  it('checks floating colored mana rather than merely advertising a spell', () => {
    const state = room(); card(state, { manaCost: '{R}' });
    expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'none' });
    state.players.player1.mana.red = 1; witnessExecutes(state);
  });
  it('counts a legal mana activation even when no spell can currently be paid for', () => {
    const state = room(); ability(state, { cost: { tap: true }, effect: { action: 'ADD_MANA', params: { color: 'red', amount: 1 } } });
    const result = witnessExecutes(state); expect(result.action.actionId).toBe('tapForMana');
    state.battlefield[0].state.isTapped = true; expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'none' });
  });
  it('does not count opponent abilities or summoning-sick mana creatures', () => {
    const state = room(); const source = ability(state, { cost: { tap: true }, effect: { action: 'ADD_MANA', params: { color: 'red', amount: 1 } } });
    source.state.summoningSickness = true; expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
    source.state.summoningSickness = false; source.state.controllerId = 'player2';
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
  });
  it('finds free non-mana abilities and honors their per-turn usage limits', () => {
    const state = room(); const source = ability(state, { limitPerTurn: 1 }); witnessExecutes(state);
    state.turnHistory!.uses[abilityUseKey(source, 'use')] = 1;
    expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'none' });
  });
  it('finds allowed hand activations', () => {
    const state = room(); card(state, { manaCost: '{9}', abilities: [{ id: 'hand', type: 'activated', allowedZones: ['hand'], effect: gain }] });
    expect(witnessExecutes(state).action.actionId).toBe('activate_ability');
  });
  it('honors sorcery timing and land allowances', () => {
    const state = room(); card(state, { cardTypes: ['Land'], onCastEffects: [] }); witnessExecutes(state);
    state.turnHistory!.landPlays.player1 = 99; expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
    state.turnHistory!.landPlays.player1 = 0; state.phase = 'beginCombatStep'; expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
  });
  it('finds legal instant spells in another player’s turn', () => {
    const state = room(); state.phase = 'beginCombatStep'; state.activeTurnPlayerId = 'player2';
    card(state, { castRequirements: { speed: 'instant' } }); witnessExecutes(state);
    state.players.player1.hand[0].blueprint.castRequirements.speed = 'sorcery';
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
  });
  it('rejects missing targets and hexproof, and validates a real target witness', () => {
    const state = room(); card(state, { onCastEffects: [{ action: 'DEAL_DAMAGE', params: { amount: 1 }, targeting: enemy }] });
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
    const target = creature('enemy', 'player2', 2, 4, ['Hexproof']); state.battlefield.push(target);
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
    target.blueprint = { ...target.blueprint, keywords: [] }; witnessExecutes(state);
  });
  it('requires complete target groups rather than one legal target anywhere', () => {
    const state = room(); card(state, { onCastEffects: [
      { action: 'DEAL_DAMAGE', params: { amount: 1 }, targeting: enemy },
      { action: 'DEAL_DAMAGE', params: { amount: 1 }, targeting: { ...enemy, subTypes: ['missing'] } },
    ] }); state.battlefield.push(creature('enemy', 'player2'));
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
    state.battlefield[0].blueprint.subTypes = ['missing']; witnessExecutes(state);
  });
  it('explores a playable mode when another mode lacks targets', () => {
    const state = room(); card(state, { onCastEffects: [], modes: [
      { id: 'bad', effects: [{ action: 'DEAL_DAMAGE', params: { amount: 1 }, targeting: enemy }] },
      { id: 'good', effects: [gain] },
    ] }); const result = witnessExecutes(state); expect(result.action.data.modes).toEqual(['good']);
  });
  it('explores alternatives and additional discard costs', () => {
    const state = room(); card(state, { castRequirements: { cost: { mana: { generic: 9 } },
      alternativeCosts: [{ id: 'life', label: 'Life', cost: { life: 2 } }], additionalCost: { discard: 1 } } });
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
    card(state, { manaCost: '{99}' }); const result = witnessExecutes(state);
    expect(result.action.data.costRoute).toEqual({ kind: 'alternative', id: 'life' });
    expect(result.action.data.discardUuids).toHaveLength(1);
  });
  it('finds declared X=0 and exhausts a small unaffordable finite range', () => {
    const state = room(); card(state, { manaCost: '{X}', numericDeclarations: [{ name: 'X', min: 0, max: 2 }] });
    expect(witnessExecutes(state).action.data.numericBindings).toEqual({ X: 0 });
    state.players.player1.hand[0].blueprint.numericDeclarations = [{ name: 'X', min: 1, max: 3 }];
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
  });
  it('returns unknown for an unexhausted numeric range but still finds another available action', () => {
    const state = room(); card(state, { manaCost: '{X}', numericDeclarations: [{ name: 'X', min: 1 }] });
    expect(hasLegalNonPassAction(state, 'player1')).toMatchObject({ kind: 'unknown' });
    card(state); witnessExecutes(state);
  });
  it('finds an instant response while a stack object exists, then rejects another player’s priority window', () => {
    const state = room(); state.phase = 'beginCombatStep';
    state.stack.push({ uuid: 'waiting', type: 'triggered', source: creature('other', 'player2'),
      controllerId: 'player2', effects: [], countered: false });
    card(state, { castRequirements: { speed: 'instant' } }); witnessExecutes(state);
    state.priorityPlayerId = 'player2';
    expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'unknown', reason: 'not_ready' });
  });
  it('labels an incompletely explored finite number range as unknown', () => {
    const state = room(); card(state, { manaCost: '{X}', numericDeclarations: [{ name: 'X', min: 1, max: 100 }] });
    expect(hasLegalNonPassAction(state, 'player1')).toEqual({ kind: 'unknown', reason: 'number_range_limit' });
  });
  it('honors cast discounts and prohibitions through the existing validators', () => {
    const state = room(); card(state, { manaCost: '{3}' });
    card(state, { cardTypes: ['Artifact'], onCastEffects: [], abilities: [{ id: 'static', type: 'static', rules: [
      { id: 'free', family: 'costs', action: 'cast', scope: { controller: 'self' }, operation: { type: 'mana.waive_base' } },
    ] }] }, 'battlefield'); witnessExecutes(state);
    state.battlefield[0].blueprint.abilities = parseCardDefinition({ schemaVersion: 1, id: 'ban', abilities: [
      { id: 'ban', type: 'static', rules: [{ id: 'ban', family: 'permissions', scope: { controller: 'self', zones: ['hand'] },
        operation: { type: 'PERMISSION', rules: [{ action: 'cast', mode: 'prohibit', players: 'self' }] } }] },
    ] }).abilities;
    expect(hasLegalNonPassAction(state, 'player1').kind).toBe('none');
  });
  it('constructs a legal distribution instead of assuming targets alone suffice', () => {
    const state = room(); card(state, { onCastEffects: [{ action: 'DEAL_DAMAGE', params: { amount: 2 }, targeting: enemy,
      choice: { kind: 'distribution', total: 2 } }] }); state.battlefield.push(creature('enemy', 'player2'));
    expect(witnessExecutes(state).action.data.distributions).toBeDefined();
  });
  it.each(['priority', 'status', 'outcome', 'choice', 'triggers', 'collector', 'declaration', 'resolving', 'foreign'])
  ('never reports none outside a safe priority window (%s)', gate => {
    const state = room();
    if (gate === 'priority') state.priorityPlayerId = 'player2';
    if (gate === 'status') state.status = 'RPS';
    if (gate === 'outcome') state.outcome = { type: 'win', winnerId: 'player2', losses: [] };
    if (gate === 'choice') state.pendingChoice = { kind: 'number', id: 'n', playerId: 'player1', prompt: 'X', range: { min: 0 },
      continuation: { type: 'action', actionId: 'cast_spell', field: 'numericBindings', data: {} } };
    if (gate === 'triggers') state.triggerQueue = { groups: [] } as any;
    if (gate === 'collector') state.pendingTriggers = [{ type: 'SET_LIFE', playerId: 'player1', amount: 20 }];
    if (gate === 'declaration') state.phase = 'declareAttackersStep';
    if (gate === 'resolving') state.engineState = 'resolving_stack';
    expect(hasLegalNonPassAction(state, gate === 'foreign' ? 'intruder' : 'player1')).toEqual({ kind: 'unknown', reason: 'not_ready' });
  });
  it('returns unknown on resource exhaustion and validates its budget', () => {
    const state = room(); card(state); expect(hasLegalNonPassAction(state, 'player1', { maxNodes: 1 }).kind).toBe('available');
    card(state, { manaCost: '{9}' }); state.players.player1.hand.shift();
    expect(hasLegalNonPassAction(state, 'player1', { maxNodes: 1 }).kind).toBe('none');
    card(state); expect(hasLegalNonPassAction(state, 'player1', { maxNodes: 1 })).toEqual({ kind: 'unknown', reason: 'search_limit' });
    expect(() => hasLegalNonPassAction(state, 'player1', { maxNodes: 0 })).toThrow(RangeError);
  });
});
