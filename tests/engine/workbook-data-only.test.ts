import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@engine/game-engine';
import { CardCharacteristicService as characteristics } from '@engine/card-characteristic-service';
import { instantiateCard } from '@library/card-factory';
import { OptionService } from '@engine/option-service';
import { buildCatalog } from '@server/catalog/catalog';
import { deckEligibility, validateDeck } from '@card-game/protocol';
import auroraDeck from '../../docs/decks/aurora-workbook.json';
import { creature } from '../helpers/combat-fixture';
import { createTestRoom, fillTestLibraries } from '../helpers/test-room-factory';
import type { CardInstance, CardZone } from '@shared/card.types';

const engines: GameEngine[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));
function card(id: string, zone: CardZone = 'battlefield', player = 'player1') {
  const value = instantiateCard(id);
  value.state = { ...value.state, zone, ownerId: player, controllerId: player, summoningSickness: false };
  return value;
}
function game(id: string, zone: CardZone = 'battlefield') {
  const room = createTestRoom(); fillTestLibraries(room, 20);
  room.players.player1.hand = []; room.players.player2.hand = [];
  const source = card(id, zone);
  if (zone === 'battlefield') room.battlefield.push(source);
  else if (zone === 'hand') room.players.player1.hand.push(source);
  const engine = new GameEngine(room); engine.initRoom(); engines.push(engine);
  return { engine, source };
}
function cast(engine: GameEngine, source: CardInstance) {
  expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: source.uuid }).success).toBe(true);
  expect(engine.resolveTopOfStack().success).toBe(true);
}
function attach(engine: GameEngine, source: CardInstance, host: CardInstance) {
  expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'attach', targets: [{ targetType: 'permanent', cardUuid: host.uuid }] }).success).toBe(true);
  expect(engine.resolveTopOfStack().success).toBe(true);
}
function attack(engine: GameEngine, host: CardInstance) {
  engine.roomState.phase = 'declareAttackersStep'; engine.roomState.priorityPlayerId = null;
  expect(engine.executePlayerAction('player1', 'declare_attackers', { attackers: [{ cardUuid: host.uuid }] }).success).toBe(true);
}
function choose(engine: GameEngine, ids: string[]) {
  const choice = engine.roomState.pendingChoice!;
  expect(choice).toBeTruthy();
  expect(engine.executePlayerAction(choice.playerId, 'choose', { choiceId: choice.id, choices: ids }).success).toBe(true);
}
function events(engine: GameEngine) { return engine.drainEventBatches().flatMap(batch => batch.events); }

describe('additional workbook cards using existing primitives', () => {
  it.each([
    ['heavenly-lance', '天域長槍', 'yellow', { yellow: 2 }],
    ['thunder-devouring-holy-sword', '吞雷聖劍', 'yellow', { yellow: 2 }],
    ['heavenly-gatekeeper', '天域門衛', 'yellow', { yellow: 1, generic: 1 }],
    ['heavenly-patrol', '天域巡邏兵', 'yellow', { yellow: 2 }],
    ['heavenly-marquis-laila', '天域三侯 萊拉', 'yellow', { yellow: 1, generic: 1 }],
    ['heavenly-gate', '天域之門', 'yellow', { yellow: 2, generic: 1 }],
    ['aurora-ice-dragon', '極光冰龍', 'white', { white: 2 }],
    ['dragons-blessing', '巨龍的祝福', 'white', { white: 2, generic: 1 }],
    ['frostmoon-gatekeeper', '霜月門衛', 'white', { white: 1, generic: 1 }],
    ['frost-soul', '冰霜之魂', 'white', { white: 1 }],
    ['frost-giant', '冰霜巨人', 'white', { white: 3, generic: 2 }],
    ['shadowwood-sword', '影木劍', 'black', { black: 2 }],
    ['vitality-wood-staff', '生機木杖', 'green', { green: 2, generic: 1 }],
  ])('loads %s with its printed identity and clarified cost', (id, name, color, cost) => {
    expect(instantiateCard(id as string).blueprint).toMatchObject({ name, colors: [color], castRequirements: { cost: { mana: cost } } });
  });

  it.each([
    ['heavenly-lance', 1, 1], ['thunder-devouring-holy-sword', 2, 3],
  ] as const)('%s grants attack, gains life then draws, and stops granting when detached', (id, bonus, life) => {
    const { engine, source } = game(id); const host = card('winged-envoy'); engine.roomState.battlefield.push(host);
    attach(engine, source, host);
    expect(characteristics.resolvePower(engine.roomState, host)).toBe(1 + bonus);
    attack(engine, host); expect(engine.roomState.stack).toHaveLength(1); engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(20 + life);
    expect(engine.roomState.players.player1.hand).toHaveLength(1);
    const emitted = events(engine).map(event => event.eventId);
    expect(emitted.indexOf('LIFE_GAINED')).toBeLessThan(emitted.indexOf('CARD_DRAWN'));
    engine.applyMutations([{ type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' }]);
    expect(characteristics.resolvePower(engine.roomState, host)).toBe(1);
    expect(characteristics.resolveAbilities(engine.roomState, host).some(a => a.id?.startsWith(id + '-attack'))).toBe(false);
  });

  it.each(['thunder-devouring-holy-sword', 'shadowwood-sword'])('%s enforces tribe and controller restrictions', id => {
    const { engine, source } = game(id);
    const wrong = card(id === 'shadowwood-sword' ? 'winged-envoy' : 'phantom-captain');
    const enemy = card(id === 'shadowwood-sword' ? 'phantom-captain' : 'winged-envoy', 'battlefield', 'player2');
    engine.roomState.battlefield.push(wrong, enemy);
    for (const host of [wrong, enemy]) expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'attach', targets: [{ targetType: 'permanent', cardUuid: host.uuid }] }).success).toBe(false);
  });

  it('shadowwood reduces maximum life permanently, without dealing damage or persisting across reincarnations', () => {
    const { engine, source } = game('shadowwood-sword'); const host = card('phantom-land-soldier'); const enemy = creature('enemy', 'player2', 2, 5);
    engine.roomState.battlefield.push(host, enemy); attach(engine, source, host); attack(engine, host);
    const choice = engine.roomState.pendingChoice!; if (choice.kind === 'number') throw new Error('Expected targeting');
    choose(engine, [choice.options.find(option => JSON.stringify(option.value).includes(enemy.uuid))!.id]); engine.resolveTopOfStack();
    expect(characteristics.resolveToughness(engine.roomState, enemy)).toBe(4);
    expect(engine.roomState.battlefield.find(c => c.uuid === enemy.uuid)!.state.damageTaken).toBe(0);
    engine.applyMutations([{ type: 'CLEAR_END_OF_TURN_EFFECTS' }, { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' }]);
    expect(characteristics.resolveToughness(engine.roomState, enemy)).toBe(4);
    expect(events(engine).some(e => e.eventId === 'DAMAGE_DEALT')).toBe(false);
    engine.applyMutations([{ type: 'MOVE_CARD', cardUuid: enemy.uuid, playerId: 'player2', from: 'battlefield', to: 'graveyard' }, { type: 'MOVE_CARD', cardUuid: enemy.uuid, playerId: 'player2', from: 'graveyard', to: 'battlefield' }]);
    expect(characteristics.resolveToughness(engine.roomState, engine.roomState.battlefield.find(c => c.uuid === enemy.uuid)!)).toBe(5);
  });

  it.each([true, false])('staff offers its complete hand exchange as one optional decision (accept=%s)', accept => {
    const { engine, source } = game('vitality-wood-staff', 'hand'); const discarded = card('land-red', 'hand');
    engine.roomState.players.player1.hand.push(discarded); engine.roomState.players.player2.hand = [card('land-red', 'hand', 'player2'), card('land-red', 'hand', 'player2')];
    cast(engine, source); engine.resolveTopOfStack(); choose(engine, accept ? ['replace-hand'] : []);
    expect(engine.roomState.players.player1.hand).toHaveLength(accept ? 2 : 1);
    expect(engine.roomState.players.player1.graveyard.map(c => c.uuid).includes(discarded.uuid)).toBe(accept);
    expect(engine.roomState.players.player2.hand).toHaveLength(2);
    if (accept) {
      const emitted = events(engine).map(e => e.eventId);
      expect(emitted.indexOf('CARD_DISCARDED_FROM_HAND')).toBeLessThan(emitted.indexOf('CARD_DRAWN'));
    }
    const host = card('winged-envoy'); engine.roomState.battlefield.push(host); attach(engine, source, host);
    expect(characteristics.resolvePower(engine.roomState, host)).toBe(3);
  });

  it.each([0, 2])('staff can replace an empty hand with %s cards from the opponent hand count', opponentCount => {
    const { engine, source } = game('vitality-wood-staff', 'hand');
    engine.roomState.players.player2.hand = Array.from({ length: opponentCount }, () => card('land-red', 'hand', 'player2'));
    cast(engine, source); engine.resolveTopOfStack(); choose(engine, ['replace-hand']);
    expect(engine.roomState.pendingChoice).toBeFalsy(); expect(engine.roomState.players.player1.hand).toHaveLength(opponentCount);
  });

  it.each(['destroy', 'sacrifice'] as const)('gatekeeper only rewards its own destruction (departure=%s)', reason => {
    const { engine, source } = game('heavenly-gatekeeper');
    engine.applyMutations(reason === 'destroy' ? [{ type: 'DESTROY_CARD', cardUuid: source.uuid, zoneRevision: source.state.zoneRevision ?? 0 }]
      : [{ type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard', reason }]);
    expect(engine.roomState.stack).toHaveLength(reason === 'destroy' ? 1 : 0); engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(reason === 'destroy' ? 21 : 20);
    expect(engine.roomState.players.player1.hand).toHaveLength(reason === 'destroy' ? 1 : 0);
  });

  it('gatekeeper gains life and draws when it blocks, without triggering for other blockers', () => {
    const { engine, source } = game('heavenly-gatekeeper'); const attacker = creature('enemy', 'player2'); const other = card('winged-envoy');
    engine.roomState.battlefield.push(attacker, other); engine.roomState.activeTurnPlayerId = 'player2';
    engine.roomState.phase = 'declareBlockersStep'; engine.roomState.priorityPlayerId = null;
    engine.roomState.combatDeclarations = { attackers: true, blockers: false };
    engine.roomState.combat = [{ uuid: attacker.uuid, attacker, attackerPower: 2, blockers: [] }];
    expect(engine.executePlayerAction('player1', 'declare_blockers', { assignments: [{ attackerUuid: attacker.uuid, blockerUuids: [source.uuid, other.uuid] }] }).success).toBe(true);
    expect(engine.roomState.stack).toHaveLength(1); engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(21); expect(engine.roomState.players.player1.hand).toHaveLength(1);
  });

  it('gate gains life then draws on entry, and sacrifices as a main-phase mana cost without destruction or hand discard', () => {
    const { engine, source } = game('heavenly-gate', 'hand'); cast(engine, source); engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.life).toBe(21); expect(engine.roomState.players.player1.hand).toHaveLength(1);
    events(engine); const before = engine.roomState.players.player1.mana.yellow;
    engine.roomState.phase = 'declareAttackersStep';
    expect(engine.executePlayerAction('player1', 'tapForMana', { cardUuid: source.uuid, abilityId: 'sacrifice-for-yellow' }).success).toBe(false);
    engine.roomState.phase = 'stateMainPhase'; engine.roomState.priorityPlayerId = 'player1';
    expect(engine.executePlayerAction('player1', 'tapForMana', { cardUuid: source.uuid, abilityId: 'sacrifice-for-yellow' })).toMatchObject({ success: true });
    if (engine.roomState.stack.length) engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.mana.yellow).toBe(before + 1);
    expect(engine.roomState.players.player1.graveyard.map(c => c.uuid)).toContain(source.uuid);
    const emitted = events(engine).map(e => e.eventId);
    expect(emitted).not.toContain('PERMANENT_DESTROYED'); expect(emitted).not.toContain('CARD_DISCARDED_FROM_HAND');
  });

  it('frost giant pays three cold and two generic mana and enters as an 8/8', () => {
    const { engine, source } = game('frost-giant', 'hand');
    engine.roomState.players.player1.mana = { white: 2, blue: 3, red: 0, black: 0, yellow: 0, green: 0 };
    expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: source.uuid }).success).toBe(false);
    engine.roomState.players.player1.mana = { white: 3, blue: 2, red: 0, black: 0, yellow: 0, green: 0 }; cast(engine, source);
    expect(characteristics.resolvePower(engine.roomState, source)).toBe(8); expect(characteristics.resolveToughness(engine.roomState, source)).toBe(8);
    expect(Object.values(engine.roomState.players.player1.mana).every(n => n === 0)).toBe(true);
  });

  it('gate can instead be discarded from hand for immediate mana without entry rewards', () => {
    const { engine, source } = game('heavenly-gate', 'hand');
    expect(new OptionService().getOptions(engine.roomState, 'player1', source.uuid, 'hand').find(option => option.data?.abilityId === 'discard-for-yellow')).toMatchObject({ actionId: 'activate_ability', disabled: false });
    const before = engine.roomState.players.player1.mana.yellow;
    const activate = (abilityId: string) => engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId });
    engine.roomState.phase = 'postcombatMainPhase';
    expect(activate('sacrifice-for-yellow').success).toBe(false);
    expect(engine.executePlayerAction('player2', 'activate_ability', { cardUuid: source.uuid, abilityId: 'discard-for-yellow' }).success).toBe(false);
    expect(activate('discard-for-yellow').success).toBe(true);
    expect(engine.roomState.stack).toHaveLength(0);
    expect(engine.roomState.players.player1.mana.yellow).toBe(before + 1);
    expect(engine.roomState.players.player1.hand).toHaveLength(0);
    expect(engine.roomState.players.player1.graveyard.map(c => c.uuid)).toContain(source.uuid);
    expect(engine.roomState.players.player1.life).toBe(20);
    const emitted = events(engine).map(e => e.eventId);
    expect(emitted).toContain('CARD_DISCARDED_FROM_HAND'); expect(emitted).not.toContain('PERMANENT_ENTERED');
    expect(emitted).not.toContain('CARD_DRAWN'); expect(emitted).not.toContain('PERMANENT_DESTROYED');
    expect(activate('discard-for-yellow').success).toBe(false);
  });

  it('gate hand-discard route also respects main-phase timing', () => {
    const { engine, source } = game('heavenly-gate', 'hand');
    engine.roomState.phase = 'declareAttackersStep'; engine.roomState.combatDeclarations = { attackers: true, blockers: false };
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'discard-for-yellow' }).success).toBe(false);
    expect(engine.roomState.players.player1.hand.map(c => c.uuid)).toContain(source.uuid);
  });

  it.each(['none', 'friendly-dragon', 'enemy-dragon', 'wrong-tribe', 'leaves', 'decline'] as const)('frost soul draws only with an Aurora-marked friendly ice dragon (%s)', scenario => {
    const { engine, source } = game('frost-soul', 'hand'); const dragon = card('winter-drake', 'battlefield', scenario === 'enemy-dragon' ? 'player2' : 'player1');
    if (scenario === 'wrong-tribe') dragon.blueprint = { ...dragon.blueprint, subTypes: ['上使'] };
    dragon.state.counters.aurora = 1; if (scenario !== 'none') engine.roomState.battlefield.push(dragon);
    cast(engine, source);
    if (scenario === 'leaves') engine.applyMutations([{ type: 'MOVE_CARD', cardUuid: dragon.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' }]);
    engine.resolveTopOfStack();
    if (engine.roomState.pendingChoice) choose(engine, [scenario === 'decline' ? 'no' : 'yes']);
    expect(engine.roomState.players.player1.hand).toHaveLength(scenario === 'friendly-dragon' ? 1 : 0);
  });

  it('patrol only draws once per turn for charge additions to the named emperor', () => {
    const { engine } = game('heavenly-patrol'); const emperor = creature('emperor', 'player1');
    const other = creature('other', 'player1'); engine.roomState.battlefield.push(other);
    engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: other.uuid, counterType: 'charge', amount: 1 }]);
    expect(engine.roomState.stack).toHaveLength(0);
    emperor.blueprint = { ...emperor.blueprint, name: '天使皇 亞拉里亞', cardTypes: ['Land'] }; engine.roomState.battlefield.push(emperor);
    const change = (counterType: string, amount: number) => engine.applyMutations([{ type: 'ADD_COUNTER', cardUuid: emperor.uuid, counterType, amount }]);
    change('scorch', 1); expect(engine.roomState.stack).toHaveLength(0);
    change('charge', 2); expect(engine.roomState.stack).toHaveLength(1); engine.resolveTopOfStack();
    change('charge', 1); expect(engine.roomState.stack).toHaveLength(0);
    expect(engine.roomState.players.player1.hand).toHaveLength(1);
    engine.applyMutations([{ type: 'SET_TURN', playerId: 'player2', advance: true }]);
    engine.applyMutations([{ type: 'REMOVE_COUNTER', cardUuid: emperor.uuid, counterType: 'charge', amount: 1 }]); expect(engine.roomState.stack).toHaveLength(0);
    change('charge', 1); expect(engine.roomState.stack).toHaveLength(1); engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.hand).toHaveLength(2);
  });

  it('Laila counters an opposing spell and then exiles herself', () => {
    const { engine, source } = game('heavenly-marquis-laila'); const spell = card('broken-fireball', 'hand', 'player2');
    engine.roomState.players.player2.hand = [spell]; engine.roomState.activeTurnPlayerId = 'player2'; engine.roomState.priorityPlayerId = 'player2';
    expect(engine.executePlayerAction('player2', 'cast_spell', { cardUuid: spell.uuid, targets: [{ targetType: 'player', playerId: 'player1' }] }).success).toBe(true);
    const target = engine.roomState.stack[0]; engine.roomState.priorityPlayerId = 'player1';
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'counter-and-exile', targets: [{ targetType: 'spell', stackUuid: target.uuid }] }).success).toBe(true);
    engine.resolveTopOfStack();
    expect(engine.roomState.players.player1.exile?.map(c => c.uuid)).toContain(source.uuid);
    expect(engine.roomState.players.player2.graveyard.map(c => c.uuid)).toContain(spell.uuid);
    expect(engine.roomState.players.player1.life).toBe(20);
    const emitted = events(engine).map(e => e.eventId);
    expect(emitted).toContain('STACK_COUNTERED'); expect(emitted).not.toContain('DAMAGE_DEALT');
  });

  it('Laila cannot target a friendly spell or an activated ability', () => {
    const { engine, source } = game('heavenly-marquis-laila'); const spell = card('broken-fireball', 'hand');
    engine.roomState.players.player1.hand = [spell];
    expect(engine.executePlayerAction('player1', 'cast_spell', { cardUuid: spell.uuid, targets: [{ targetType: 'player', playerId: 'player2' }] }).success).toBe(true);
    const target = engine.roomState.stack[0];
    const action = () => engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'counter-and-exile', targets: [{ targetType: 'spell', stackUuid: target.uuid }] });
    expect(action().success).toBe(false);
    const enemy = card('heavenly-marquis-laila', 'battlefield', 'player2');
    engine.roomState.stack = [{ uuid: 'enemy-ability', type: 'activated', controllerId: 'player2', source: enemy, ability: enemy.blueprint.abilities[0] as Extract<typeof enemy.blueprint.abilities[number], { type: 'activated' }>, effects: [], countered: false }];
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'counter-and-exile', targets: [{ targetType: 'stack', stackUuid: 'enemy-ability' }] }).success).toBe(false);
  });

  it('Laila counters after leaving, but does not exile a returned incarnation', () => {
    const { engine, source } = game('heavenly-marquis-laila'); const spell = card('broken-fireball', 'hand', 'player2');
    engine.roomState.players.player2.hand = [spell]; engine.roomState.activeTurnPlayerId = 'player2'; engine.roomState.priorityPlayerId = 'player2';
    expect(engine.executePlayerAction('player2', 'cast_spell', { cardUuid: spell.uuid, targets: [{ targetType: 'player', playerId: 'player1' }] }).success).toBe(true);
    const target = engine.roomState.stack[0]; engine.roomState.priorityPlayerId = 'player1';
    expect(engine.executePlayerAction('player1', 'activate_ability', { cardUuid: source.uuid, abilityId: 'counter-and-exile', targets: [{ targetType: 'spell', stackUuid: target.uuid }] }).success).toBe(true);
    engine.applyMutations([{ type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'battlefield', to: 'graveyard' }, { type: 'MOVE_CARD', cardUuid: source.uuid, playerId: 'player1', from: 'graveyard', to: 'battlefield' }]);
    engine.resolveTopOfStack();
    expect(engine.roomState.battlefield.map(c => c.uuid)).toContain(source.uuid);
    expect(engine.roomState.players.player1.exile ?? []).toHaveLength(0);
    expect(engine.roomState.players.player2.graveyard.map(c => c.uuid)).toContain(spell.uuid);
  });
});

describe('workbook counter card recipes', () => {
  it('summons 極光冰龍 with an Aurora counter and taps it for cold mana', () => {
    const { engine, source } = game('aurora-ice-dragon', 'hand');
    cast(engine, source);
    expect(engine.resolveTopOfStack().success).toBe(true);
    const dragon = engine.roomState.battlefield.find(card => card.uuid === source.uuid)!;
    expect(dragon.blueprint).toMatchObject({ name: '極光冰龍', power: 0, toughness: 4 });
    expect(dragon.state.counters.aurora).toBe(1);

    engine.applyMutations([{ type: 'SET_SUMMONING_SICKNESS', cardUuid: source.uuid, value: false }]);
    const before = engine.roomState.players.player1.mana.white;
    expect(engine.executePlayerAction('player1', 'tapForMana', { cardUuid: source.uuid }).success).toBe(true);
    expect(engine.roomState.players.player1.mana.white).toBe(before + 1);
  });

  it('marks every friendly Ice Dragon and leaves other creatures and opposing dragons unmarked', () => {
    const { engine, source } = game('dragons-blessing', 'hand');
    const dragons = [card('winter-drake'), card('frost-soul')];
    const others = [card('frost-giant'), card('winter-drake', 'battlefield', 'player2')];
    engine.roomState.battlefield = [...dragons, ...others];
    cast(engine, source);
    for (const dragon of dragons)
      expect(engine.roomState.battlefield.find(card => card.uuid === dragon.uuid)?.state.counters.aurora).toBe(1);
    for (const other of others)
      expect(engine.roomState.battlefield.find(card => card.uuid === other.uuid)?.state.counters.aurora).toBeUndefined();
    expect(engine.roomState.players.player1.graveyard.some(card => card.uuid === source.uuid)).toBe(true);
  });

  it('lets 霜月門衛 mark only friendly equipment and grants the equipped attacker a draw', () => {
    const { engine, source } = game('frostmoon-gatekeeper', 'hand');
    const staff = card('vitality-wood-staff');
    engine.roomState.battlefield = [staff, card('frost-giant'), card('vitality-wood-staff', 'battlefield', 'player2')];
    cast(engine, source);
    const choice = engine.roomState.pendingChoice;
    expect(choice?.kind).toBe('targets');
    if (!choice || choice.kind !== 'targets') throw new Error('Expected equipment targets');
    expect(choice.options.map(option => (option.value as { cardUuid: string }).cardUuid)).toEqual([staff.uuid]);
    choose(engine, [choice.options[0].id]);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(engine.roomState.battlefield.find(card => card.uuid === staff.uuid)?.state.counters['frost-gear']).toBe(1);
    const host = engine.roomState.battlefield.find(card => card.uuid === source.uuid)!;
    const attacker = engine.roomState.battlefield.find(card => card.blueprint.id === 'frost-giant')!;
    expect(host.blueprint).toMatchObject({ power: 3, toughness: 4 });
    attach(engine, staff, attacker);
    const handSize = engine.roomState.players.player1.hand.length;
    attack(engine, attacker);
    expect(engine.resolveTopOfStack().success).toBe(true);
    expect(engine.roomState.players.player1.hand).toHaveLength(handSize + 1);
  });

  it('skips the gatekeeper’s trigger when only opposing equipment is available', () => {
    const { engine, source } = game('frostmoon-gatekeeper', 'hand');
    engine.roomState.battlefield = [card('vitality-wood-staff', 'battlefield', 'player2')];
    cast(engine, source);
    expect(engine.roomState.pendingChoice).toBeFalsy();
    expect(engine.roomState.stack).toHaveLength(0);
  });
});

it('validates the Aurora sample with workbook copy limits and a cold-only payment base', () => {
  const standard = buildCatalog();
  const workbook = new Map([...standard].map(([id, entry]) => [id, {
    ...entry,
    copyLimit: entry.copyLimit === null ? null : deckEligibility.copyLimits[id] ?? 3,
  }]));
  expect(validateDeck(auroraDeck, standard).valid).toBe(true);
  expect(validateDeck(auroraDeck, workbook).valid).toBe(true);
  expect(auroraDeck.cards.reduce((sum, card) => sum + card.quantity, 0)).toBe(60);
  const landCount = auroraDeck.cards.reduce((sum, card) => {
    return sum + (standard.get(card.cardId)?.cardTypes.includes('Land') ? card.quantity : 0);
  }, 0);
  expect(landCount).toBe(24);
  for (const { cardId } of auroraDeck.cards) {
    const card = instantiateCard(cardId);
    expect(Object.keys(card.blueprint.castRequirements.cost?.mana ?? {}).every(color => ['white', 'generic'].includes(color))).toBe(true);
  }
});
