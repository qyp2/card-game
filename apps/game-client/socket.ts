import { io, type Socket } from 'socket.io-client';
import { PROTOCOL_VERSION, isProtocolMessage, type SnapshotMessage, type OptionsMessage, type ServerEvents, type ClientEvents } from '@card-game/protocol';
import { useGameStore } from './store/gameStore';
import type { ViewDelta } from '@card-game/protocol';
import { clientLogger } from './logger';
import { getStoredAuth, getStoredRoomId } from './session';
import { useAuthStore } from './auth-state';
import { SessionInfoSchema } from '@card-game/protocol';
import { clientFlags as gameConfig } from './config';

/**
 * Socket.IO client singleton.
 * Binds all server→client events to the Zustand store.
 *
 * The `auth` handshake carries the stable player id and the persisted room id
 * on EVERY connection attempt (including automatic reconnects), so the server
 * can remap a reconnecting socket back to its existing room/player.
 */
const socket: Socket<ServerEvents, ClientEvents> = io({
  autoConnect: false,
  auth: (cb) => {
    cb({
      protocolVersion: PROTOCOL_VERSION,
      token: getStoredAuth()?.token,
      roomId: getStoredRoomId(),
    });
  },
});

export async function connectWithSession(preferBrowser = false): Promise<void> {
  await useAuthStore.getState().ensureGuest(preferBrowser);
  const testRoom=typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('testRoom');
  const current=getStoredAuth();
  if(testRoom&&current){
    if(!/^[a-f0-9-]{36}$/.test(testRoom))throw new Error('Invalid test room reference.');
    const response=await fetch('/api/lab/rooms/'+encodeURIComponent(testRoom)+'/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current.token},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION})});
    if(!response.ok)throw new Error('Sign in with an assigned lab account before claiming this test seat.');
    const info=SessionInfoSchema.parse(await response.json());
    if(getStoredAuth()?.sessionId!==current.sessionId)return;
    useAuthStore.getState().setSession({...current,...info});useGameStore.getState().setRoomId(testRoom);
    const clean=new URL(window.location.href);clean.searchParams.delete('testRoom');window.history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
  }
  socket.connect();
}

socket.on('sessionReady', data => {
  const parsed = SessionInfoSchema.safeParse(data), current = useAuthStore.getState().session;
  if (!parsed.success || !current || parsed.data.sessionId !== current.sessionId) return;
  const { roomId: _oldRoom, ...prior } = current;
  useAuthStore.getState().setSession({ ...prior, ...parsed.data });
  useGameStore.getState().setMyPlayerId(parsed.data.playerId);
});
socket.on('sessionEnded', data => {
  if (!isProtocolMessage(data) || data.sessionId !== useAuthStore.getState().session?.sessionId) return;
  useAuthStore.getState().setSession(null);
  socket.disconnect();
  if (data.reason !== 'linked') useGameStore.getState().clearSession();
  if (data.reason !== 'linked' && data.reason !== 'rotated') useGameStore.getState().setError('Session ended. Sign in again to continue.');
});

socket.on('connect', () => {
  clientLogger.info('connected', 'Connected to server', { socketId: socket.id });
});

socket.on('stateDelta', (delta: ViewDelta) => {
  if (!isProtocolMessage(delta)) return;
  useGameStore.getState().applyDelta(delta);
});

socket.on('roomCreated', (data: { roomId: string }) => {
  if (!isProtocolMessage(data)) return;
  useGameStore.getState().setRoomId(data.roomId);
});

socket.on('roomSnapshot', (data: SnapshotMessage) => {
  if (!isProtocolMessage(data) || !isProtocolMessage(data.room)) return;
  if (data.room.viewerId !== useGameStore.getState().myPlayerId) return;
  useGameStore.getState().setRoom(data.room, data.seq);
});

socket.on('roomJoined', (data: { roomId: string }) => {
  if (!isProtocolMessage(data)) return;
  useGameStore.getState().setRoomId(data.roomId);
});

socket.on('rejoined', (data: { roomId: string; playerId: string }) => {
  if (!isProtocolMessage(data)) return;
  clientLogger.info('rejoined', 'Rejoined room', { roomId: data.roomId, playerId: data.playerId });
  useGameStore.getState().setRoomId(data.roomId);
  useGameStore.getState().setMyPlayerId(data.playerId);
});

socket.on('rejoinFailed', (data: { reason: string }) => {
  if (!isProtocolMessage(data)) return;
  clientLogger.warn('rejoin:failed', `Rejoin failed: ${data.reason}`, { reason: data.reason });
  returnToLobby();
});

function returnToLobby(): void {
  useGameStore.getState().clearSession();
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', '/play');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
socket.on('roomLeft', data => {
  if (!isProtocolMessage(data) || data.roomId !== useGameStore.getState().roomId) return;
  returnToLobby();
});
socket.on('roomDestroyed', (data: { roomId: string }) => {
  if (!isProtocolMessage(data)) return;
  if (data.roomId !== useGameStore.getState().roomId) return;
  clientLogger.info('room:destroyed', 'Room was destroyed', { roomId: data.roomId });
  returnToLobby();
});

socket.on('playerJoined', (data: { playerId: string }) => {
  if (!isProtocolMessage(data)) return;
  clientLogger.info('opponent:joined', 'Opponent joined', { opponentId: data.playerId });
});

socket.on('rpsPhase', (data: { message: string }) => {
  if (!isProtocolMessage(data)) return;
  clientLogger.info('rps:phase', data.message);
});

socket.on('startGame', (data: { roomId: string }) => {
  if (!isProtocolMessage(data)) return;
  clientLogger.info('game:started', 'Game started', { roomId: data.roomId });
});

socket.on('optionsForCard', (data: OptionsMessage) => {
  const state = useGameStore.getState();
  if (!isProtocolMessage(data) || data.roomId !== state.roomId || data.cardUuid !== state.pendingCard?.cardUuid || data.zone !== state.pendingCard?.zone) return;
  useGameStore.getState().showContextMenu(data.options);
});

socket.on('error', (data: { message: string; action?: string; commandId?: string }) => {
  if (!isProtocolMessage(data)) return;
  if (gameConfig.logging.actions) clientLogger.warn(data.action ? 'action:rejected' : 'room:rejected', data.message, data);
  useGameStore.getState().setError(data.message);
});

socket.on('roomFull', (data: unknown) => {
  if (isProtocolMessage(data)) useGameStore.getState().setError('This room is full.');
});

socket.on('connect_error', (error: Error) => {
  clientLogger.error('connection:failed', error.message);
  useGameStore.getState().setError('Unable to connect to the game server: ' + error.message);
});

socket.on('disconnect', () => {
  clientLogger.info('disconnected', 'Disconnected from server');
});

export default socket;
