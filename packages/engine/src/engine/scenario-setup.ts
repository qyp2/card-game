import { createRoom, joinRoom } from './room-factory';
import { instantiateCard } from '../library/card-factory';
import { gameConfig } from '../config';
import type { RuntimeContext } from '../shared/runtime-context';
import type { GameRoom } from '../types/game.room.types';
/** Pure setup input, independent of admin/storage/transport and public validation packages. */
export interface ScenarioSetup {
    players: readonly {
        life: number;
        library: readonly {
            cardId: string;
            quantity: number;
        }[];
        libraryOrder?: readonly string[];
        hand: readonly {
            cardId: string;
            quantity: number;
        }[];
        graveyard: readonly {
            cardId: string;
            quantity: number;
        }[];
        battlefield: readonly {
            cardId: string;
            quantity: number;
        }[];
    }[];
    rulesProfile?: 'standard-v1' | 'scorch-v1';
    openingHandSize: number;
    firstPlayer: 0 | 1;
    shuffle: 'fixed' | 'seeded';
    seed: number;
}
export function scenarioRandom(seed: number): () => number { let state = seed >>> 0; return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; }; }
/** First listed library card is drawn first. IDs use supplied entropy, never the gameplay seed. */
export function buildScenarioRoom(roomId: string, players: readonly [
    string,
    string
], input: ScenarioSetup, context: RuntimeContext): GameRoom {
    const setup = { ...gameConfig.setup, openingHandSize: 0, scorch: input.rulesProfile === 'scorch-v1', developmentDeck: [], playerDecks: { [players[0]]: [], [players[1]]: [] } };
    const room = createRoom(roomId, players[0], [], { setup, debugMode: 'off' });
    joinRoom(room, players[1], []);
    room.status = 'playing';
    room.engineState = 'waiting_for_player';
    room.phase = 'stateMainPhase';
    room.activeTurnPlayerId = players[input.firstPlayer];
    room.priorityPlayerId = room.activeTurnPlayerId;
    const random = scenarioRandom(input.seed);
    const expand = (entries: readonly {
        cardId: string;
        quantity: number;
    }[]) => entries.flatMap(e => Array.from({ length: e.quantity }, () => e.cardId));
    players.forEach((id, index) => {
        const spec = input.players[index], p = room.players[id];
        p.life = spec.life;
        const cards = (ids: readonly string[], zone: 'library' | 'hand' | 'graveyard' | 'battlefield') => ids.map(cardId => { const card = instantiateCard(cardId, context); card.state = { ...card.state, ownerId: id, controllerId: id, zone }; return card; });
        let library = [...(spec.libraryOrder ?? expand(spec.library))];
        if (input.shuffle === 'seeded')
            for (let i = library.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [library[i], library[j]] = [library[j], library[i]];
            }
        p.deck = cards(library.reverse(), 'library');
        p.hand = cards(expand(spec.hand), 'hand');
        p.graveyard = cards(expand(spec.graveyard), 'graveyard');
        for (let n = 0; n < input.openingHandSize; n++) {
            const card = p.deck.pop();
            if (!card)
                throw new Error('Invalid opening draw');
            card.state.zone = 'hand';
            p.hand.push(card);
        }
        room.battlefield.push(...cards(expand(spec.battlefield), 'battlefield'));
    });
    return room;
}
