import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/gameStore';
import GameLog from './GameLog';

const EMPTY_LOG: never[] = [];

/**
 * The log as a drawer rather than a column.
 *
 * A permanent 296px rail costs the board a fifth of its width for information
 * nobody reads mid-combat. Here the log is a tab on the right edge that opens
 * over the felt when asked for. The entries stay mounted while closed, so the
 * history is never lost and the DOM still contains every line.
 */
export default function LogDrawer() {
  const count = useGameStore(useShallow((s) => (s.log ?? EMPTY_LOG).length));

  return (
    <details className="log-drawer">
      <summary className="log-drawer-tab">
        <span className="log-drawer-label">Log</span>
        <span className="log-drawer-count">{count}</span>
      </summary>
      <div className="log-drawer-panel">
        <GameLog />
      </div>
    </details>
  );
}
