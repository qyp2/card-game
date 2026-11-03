import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomRuntime } from '@server/rooms/room-runtime';
import { InMemoryStore } from '@server/rooms/state-store';
import { AuthService } from '@server/auth/service';
import { authConfig } from '@server/config';
import { createTestRoom } from '../helpers/test-room-factory';

const runtimes: RoomRuntime[] = [];
afterEach(() => { runtimes.splice(0).forEach(runtime => runtime.dispose()); vi.useRealTimers(); });
function setup() {
  const store = new InMemoryStore(), published = vi.fn(), destroyed = vi.fn();
  const runtime = new RoomRuntime(store, { publishDelta: published, roomDestroyed: destroyed }); runtimes.push(runtime);
  const created = runtime.createRoom('s1', 'p1'); runtime.joinRoom('s2', 'p2', created.roomId);
  return { store, runtime, published, destroyed, id: created.roomId };
}
describe('explicit room exit', () => {
  it('concedes, detaches, denies rejoin/actions, and keeps the opponent result available', () => {
    vi.useFakeTimers(); const { runtime, store, id, published } = setup();
    expect(runtime.leaveRoom('foreign', id)).toBeUndefined();
    expect(runtime.leaveRoom('s1', id)).toEqual({ playerId: 'p1' });
    expect(store.getRoom(id)?.outcome).toMatchObject({ winnerId: 'p2', losses: [{ reason: 'concede' }] });
    expect(published).toHaveBeenCalled();
    expect(runtime.connect('new-s1', 'p1', id).kind).toBe('rejoin_failed');
    expect(runtime.executePlayerAction('s1', { roomId: id, actionId: 'pass_priority', data: {} }).kind).toBe('error');
    vi.advanceTimersByTime(31_000); expect(store.getRoom(id)).toBeDefined();
    expect(runtime.leaveRoom('s2', id)).toEqual({ playerId: 'p2' }); expect(store.getRoom(id)).toBeUndefined();
  });
  it('does not detach a new room when the old opponent later leaves', () => {
    const { runtime, id } = setup(); runtime.leaveRoom('s1', id);
    const next = runtime.createRoom('s1', 'p1'); runtime.leaveRoom('s2', id);
    expect(runtime.currentRoom('s1')).toBe(next.roomId);
    expect(runtime.executePlayerAction('s1', { roomId: next.roomId, actionId: 'concede', data: {} })).toMatchObject({ message: 'No active opponent to concede to' });
  });
  it('destroys an empty lobby but keeps a disconnected match reconnectable', () => {
    const { runtime, id } = setup(); runtime.disconnect('s1');
    expect(runtime.connect('reconnected', 'p1', id).kind).toBe('rejoined');
    const lobby = runtime.createRoom('s3', 'p3'); runtime.leaveRoom('s3', lobby.roomId);
    expect(runtime.connect('s4', 'p3', lobby.roomId).kind).toBe('rejoin_failed');
  });
});
describe('one room per account', () => {
  it('blocks sibling tabs and other rooms until explicit seat release, and ignores destroyed rooms', async () => {
    const store = new InMemoryStore(), auth = new AuthService(store.auth, store, authConfig); await auth.ready;
    store.auth.insertAccount({ id: 'account', username: 'alice', role: 'player', passwordHash: 'unused', disabled: false, createdAt: 0 });
    const parent = auth.sessions.issue({ kind: 'account', id: 'account' }, 'game', { kind: 'browser' });
    const first = auth.sessions.issue({ kind: 'account', id: 'account' }, 'game', { kind: 'tab', parent: parent.record });
    const second = auth.sessions.issue({ kind: 'account', id: 'account' }, 'game', { kind: 'tab', parent: parent.record });
    const room = createTestRoom(); store.saveRoom(room);
    auth.claimSeat(first.record, room.roomId, 'player1');
    expect(() => auth.assertRoomAvailable(second.record)).toThrow('already has a room');
    expect(() => auth.claimSeat(second.record, room.roomId, 'player2')).toThrow('Another game tab');
    expect(() => auth.assertRoomAvailable(first.record, room.roomId)).not.toThrow();
    store.auth.deleteSeat(room.roomId, 'player1'); expect(() => auth.assertRoomAvailable(second.record)).not.toThrow();
    auth.claimSeat(second.record, room.roomId, 'player2'); store.deleteRoom(room.roomId);
    expect(() => auth.assertRoomAvailable(first.record)).not.toThrow();
  });
});
