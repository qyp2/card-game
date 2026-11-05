import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { instantiateCard } from '@library/card-factory';
import type { CardInstance, CardZone } from '@shared/card.types';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));

function card(id: string, zone: CardZone, playerId = 'player1') {
  const value = instantiateCard(id);
  value.state = { ...value.state, zone, ownerId: playerId, controllerId: playerId };
  return value;
}

function game(id: string, ...materials: CardInstance[]) {
  const source = card(id, 'hand');
  const room = createTestRoom({ battlefield: materials });
  room.players.player1.hand = [source];
  fillTestLibraries(room, 20);
  const engine = new GameEngine(room);
  engine.initRoom();
  engines.push(engine);
  return { source, engine };
}

function ritual(engine: GameEngine, source: CardInstance, materials?: { cardUuid: string; zoneRevision: number }[]) {
  return engine.executePlayerAction('player1', 'activate_ability', {
    cardUuid: source.uuid, abilityId: 'ritual', materialPayments: materials,
  });
}

function answer(engine: GameEngine, selections: string[]) {
  const choice = engine.roomState.pendingChoice;
  expect(choice).toBeDefined();
  return engine.executePlayerAction(choice!.playerId, 'choose', { choiceId: choice!.id, choices: selections });
}

function resolve(engine: GameEngine) {
  expect(engine.resolveTopOfStack().success).toBe(true);
}

const reference = (material: CardInstance) => ({ cardUuid: material.uuid, zoneRevision: material.state.zoneRevision ?? 0 });
const ids = (cards: CardInstance[]) => cards.map(material => material.uuid);

describe('workbook rituals', () => {
  it('picks multiple controlled giants, rejects an exact threshold and then special-summons the Prince', () => {
    const one = card('sea-patrol', 'battlefield');
    const first = card('phantom-sea-gotu', 'battlefield');
    const second = card('phantom-sea-tassa', 'battlefield');
    const enemy = card('phantom-sea-gotu', 'battlefield', 'player2');
    const relic = card('shifting-sea-temple', 'battlefield');
    const { engine, source } = game('blue-sea-prince', one, first, second, enemy, relic);
    expect(ritual(engine, source).success).toBe(true);
    const choice = engine.roomState.pendingChoice;
    if (!choice || choice.kind === 'number') throw new Error('Expected materials');
    expect(choice.options.map(option => option.id)).toEqual(ids([one, first, second]));
    expect(answer(engine, ids([one, first])).success).toBe(false);
    expect(engine.roomState.players.player1.graveyard).toHaveLength(0);
    expect(answer(engine, ids([first, second])).success).toBe(true);
    expect(ids(engine.roomState.players.player1.graveyard)).toEqual(ids([first, second]));
    expect(engine.roomState.players.player1.mana.blue).toBe(5);
    resolve(engine);
    expect(engine.roomState.battlefield.find(value => value.uuid === source.uuid)?.state.summonKind).toBe('effect');
    resolve(engine);
    expect(answer(engine, ['yes']).success).toBe(true);
    expect(engine.roomState.players.player1.hand).toHaveLength(2);
  });

  it('preserves the Prince’s normal mana cast without the special-entry draw', () => {
    const { engine, source } = game('blue-sea-prince');
    expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: source.uuid }).success).toBe(true);
    resolve(engine);
    expect(engine.roomState.battlefield.find(value => value.uuid === source.uuid)?.state.summonKind).toBe('cast');
    expect(engine.roomState.players.player1.mana.blue).toBe(3);
    expect(engine.roomState.stack).toHaveLength(0);
  });

  it('special-summons the Abyss Giant with two value-3 cards and mills ten on entry', () => {
    const first = card('sea-god-caller-haya', 'battlefield');
    const second = card('seaborn-illusionist', 'battlefield');
    const { engine, source } = game('abyss-giant', first, second);
    expect(ritual(engine, source, [reference(first), reference(second)]).success).toBe(true);
    resolve(engine);
    resolve(engine);
    expect(engine.roomState.players.player2.graveyard).toHaveLength(10);
    expect(ids(engine.roomState.players.player1.graveyard)).toEqual(ids([first, second]));
  });

  it('rejects duplicate, stale, opposing, and indestructible materials without paying', () => {
    const first = card('sea-god-caller-haya', 'battlefield');
    const second = card('seaborn-illusionist', 'battlefield');
    const enemy = card('sea-god-caller-haya', 'battlefield', 'player2');
    const protectedCard = card('sea-god-caller-haya', 'battlefield');
    protectedCard.blueprint = { ...protectedCard.blueprint, keywords: ['Indestructible'] };
    const { engine, source } = game('abyss-giant', first, second, enemy, protectedCard);
    for (const invalid of [reference(first), { ...reference(second), zoneRevision: 1 }, reference(enemy), reference(protectedCard)]) {
      expect(ritual(engine, source, [reference(first), invalid]).success).toBe(false);
      expect(engine.roomState.players.player1.graveyard).toHaveLength(0);
      expect(engine.roomState.stack).toHaveLength(0);
    }
  });

  it('can cancel the material picker or decline an optional replacement and then pay normally', () => {
    const first = card('sea-god-caller-haya', 'battlefield');
    const second = card('seaborn-illusionist', 'battlefield');
    const { engine, source } = game('abyss-giant', first, second);
    expect(ritual(engine, source).success).toBe(true);
    const materialChoice = engine.roomState.pendingChoice!;
    expect(engine.executePlayerAction('player1', 'choose', { choiceId: materialChoice.id, cancel: true }).success).toBe(true);
    expect(ids(engine.roomState.battlefield)).toEqual(ids([first, second]));

    engine.roomState.replacementEffects = [{
      id: 'save', label: 'Save material', optional: true,
      match: { kinds: ['destroy'], card: reference(second) }, operation: { type: 'cancel_event' },
    }];
    expect(ritual(engine, source, [reference(first), reference(second)]).success).toBe(true);
    const choice = engine.roomState.pendingChoice;
    if (!choice || choice.kind === 'number') throw new Error('Expected replacement choice');
    expect(answer(engine, [choice.options.find(option => option.value === 'skip:save')!.id]).success).toBe(true);
    expect(ids(engine.roomState.players.player1.graveyard)).toEqual(ids([first, second]));
    resolve(engine);
    expect(engine.roomState.battlefield.find(value => value.uuid === source.uuid)?.state.summonKind).toBe('effect');
  });

  it.each([true, false])('commits no destruction if a selected material is saved (optional=%s)', optional => {
    const first = card('sea-god-caller-haya', 'battlefield');
    const second = card('seaborn-illusionist', 'battlefield');
    const { engine, source } = game('abyss-giant', first, second);
    engine.roomState.replacementEffects = [{
      id: 'save', label: 'Save material', optional, uses: 1,
      match: { kinds: ['destroy'], card: reference(second) }, operation: { type: 'cancel_event' },
    }];

    expect(ritual(engine, source, [reference(first), reference(second)]).success).toBe(optional);
    if (optional) {
      const choice = engine.roomState.pendingChoice;
      if (!choice || choice.kind === 'number') throw new Error('Expected replacement choice');
      const save = choice.options.find(option => option.value === 'save')!;
      expect(answer(engine, [save.id]).success).toBe(true);
    }
    expect(engine.roomState.pendingChoice).toBeFalsy();
    expect(ids(engine.roomState.battlefield)).toEqual(ids([first, second]));
    expect(engine.roomState.players.player1.graveyard).toHaveLength(0);
    expect(ids(engine.roomState.players.player1.hand)).toEqual([source.uuid]);
    expect(engine.roomState.stack).toHaveLength(0);
    expect(engine.roomState.replacementEffects?.[0].uses).toBe(1);
  });
});
