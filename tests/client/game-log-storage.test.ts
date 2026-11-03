import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@client/store/gameStore';
import { setStoredAuth } from '@client/session';
import { readGameLog, writeGameLog } from '@client/game-log-storage';
import { createTestRoom } from '../helpers/client-view-fixture';

const session = { protocolVersion: 1 as const, scope: 'game' as const, sessionId: 'session', playerId: 'player1',
  token: 'A'.repeat(43), expiresAt: Date.now() + 60000, account: null };
beforeEach(() => {
  const data: Record<string, string> = {};
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value; },
    get length() { return Object.keys(data).length; }, key: (index: number) => Object.keys(data)[index] ?? null,
    removeItem: (key: string) => { delete data[key]; }, clear: () => { for (const key of Object.keys(data)) delete data[key]; } });
  setStoredAuth(session); useGameStore.setState({ room: null, roomId: null, log: [], lastSeq: 0, myPlayerId: 'player1' });
});
afterEach(() => { setStoredAuth(null); vi.unstubAllGlobals(); });
describe('tab-local game log', () => {
  it('restores display history after refreshing without restoring stale board authority or duplicating deltas', () => {
    const room = createTestRoom(), store = useGameStore.getState(); store.setRoom(room, 0);
    store.applyDelta({ protocolVersion: 1, roomId: room.roomId, viewerId: room.viewerId, seq: 1, timestamp: 0, changes: [] });
    expect(useGameStore.getState().log).toHaveLength(1);
    useGameStore.setState({ room: null, log: [], lastSeq: 0 }); store.setRoom(room, 1);
    expect(useGameStore.getState().log).toHaveLength(1);
    store.applyDelta({ protocolVersion: 1, roomId: room.roomId, viewerId: room.viewerId, seq: 1, timestamp: 0, changes: [] });
    expect(useGameStore.getState().log).toHaveLength(1);
    expect(readGameLog(room.roomId, 'other-player', 100)).toEqual([]);
    store.clearSession(); expect(readGameLog(room.roomId, room.viewerId, 100)).toEqual([]);
    setStoredAuth({ ...session, sessionId: 'other-session' }); expect(readGameLog(room.roomId, room.viewerId, 100)).toEqual([]);
  });
  it('bounds history, filters future sequence numbers and tolerates blocked/corrupt storage', () => {
    const rows = Array.from({ length: 120 }, (_, seq) => ({ seq, changes: 0, summary: 'safe' }));
    writeGameLog('room', 'player1', rows); expect(readGameLog('room', 'player1', 999)).toHaveLength(100);
    expect(readGameLog('room', 'player1', 25).map(row => row.seq)).toEqual([20, 21, 22, 23, 24, 25]);
    vi.stubGlobal('sessionStorage', { getItem: () => '{bad', setItem: () => { throw new Error('quota'); } });
    expect(readGameLog('room', 'player1', 999)).toEqual([]); expect(() => writeGameLog('room', 'player1', rows)).not.toThrow();
  });
});
