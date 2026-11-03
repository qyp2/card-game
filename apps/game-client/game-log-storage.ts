import { getStoredAuth } from './session';
import { clientUi } from './config';

export interface GameLogEntry {
  seq: number; action?: string; playerId?: string; commandId?: string; summary?: string; changes: number;
}
const prefix = 'cardgame.gameLog.';
export const GAME_LOG_LIMIT = clientUi.gameLogMaxEntries;
function key(roomId: string, viewerId: string): string | null {
  const session = getStoredAuth();
  return session ? prefix + [session.sessionId, roomId, viewerId].map(encodeURIComponent).join('.') : null;
}
function valid(entry: unknown): entry is GameLogEntry {
  if (!entry || typeof entry !== 'object') return false;
  const row = entry as Record<string, unknown>;
  return Number.isSafeInteger(row.seq) && (row.seq as number) >= 0 && Number.isSafeInteger(row.changes) &&
    (row.changes as number) >= 0 && ['action', 'playerId', 'commandId', 'summary'].every(field =>
      row[field] === undefined || typeof row[field] === 'string' && (row[field] as string).length <= clientUi.gameLogSummaryMaxLength);
}
/** Restore only this tab session/viewer's bounded display history, never game authority. */
export function readGameLog(roomId: string, viewerId: string, seq: number): GameLogEntry[] {
  try {
    const name = key(roomId, viewerId);
    if (!name || typeof sessionStorage === 'undefined') return [];
    const raw = sessionStorage.getItem(name);
    if (!raw || raw.length > 1000000) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.every(valid)) return [];
    return rows.filter(row => row.seq <= seq).slice(-GAME_LOG_LIMIT);
  } catch { return []; }
}
/** Store summaries only; blocked/full browser storage never interrupts play. */
export function writeGameLog(roomId: string, viewerId: string, rows: GameLogEntry[]): void {
  try {
    const name = key(roomId, viewerId);
    if (!name || typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(name, JSON.stringify(rows.slice(-GAME_LOG_LIMIT).map(row => ({ ...row, summary: row.summary?.slice(0, clientUi.gameLogSummaryMaxLength) }))));
  } catch { /* In-memory history remains usable. */ }
}
/** Discard this tab's cached histories on explicit exit or session cleanup. */
export function clearGameLogs(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const names = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
    for (const name of names) if (name?.startsWith(prefix)) sessionStorage.removeItem(name);
  } catch { /* Storage may be unavailable. */ }
}
