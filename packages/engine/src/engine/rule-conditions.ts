import type { CardInstance, CardSnapshot } from '../types/card.types';
import type { GameRoom } from '../types/game.room.types';
import type { TriggeringEvent } from '../types/effect.types';
import { captureSourceInformation } from './source-information';
import { emptyEventCounts } from './turn-history';
import { readRulePath } from '../shared/rule-path';
import { createBoardNumericContext } from './numeric-characteristics';
import { roomCards } from './continuous-effect-state';
import { CardCharacteristicService } from './card-characteristic-service';

export { readRulePath } from '../shared/rule-path';

export { conditionMatches } from '../shared/rule-condition-matcher';

export function createRuleContext(room: GameRoom | undefined, source: CardInstance, controllerId: string, event?: TriggeringEvent, snapshot?: CardSnapshot, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const info = snapshot ?? (room ? captureSourceInformation(room, source) : { card: source, power: source.blueprint.power ?? 0, toughness: source.blueprint.toughness ?? 0 });
  const fields = { source: { ...info.card, power: info.power, toughness: info.toughness }, controller: room?.players[controllerId], event,
    room: room ? { phase: room.phase, turnNumber: room.turnNumber ?? 1, activeTurnPlayerId: room.activeTurnPlayerId } : undefined,
    history: { ...room?.turnHistory, own: room?.turnHistory?.playerCounts[controllerId] ?? emptyEventCounts() }, ...extra };
  return { ...fields, numericContext: room ? createBoardNumericContext({ cards: roomCards(room), characteristics: card => CardCharacteristicService.resolve(room, card),
    source: info.card, controllerId, fields, defaultCountZones: ['battlefield'] }) : { readField: (path: string) => readRulePath(fields, path) } };
}
