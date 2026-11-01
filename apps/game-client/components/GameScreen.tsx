import { useGameStore } from '../store/gameStore';
import PlayerInfo from './PlayerInfo';
import OpponentInfo from './OpponentInfo';
import Hand from './Hand';
import Battlefield from './Battlefield';
import StackDisplay from './StackDisplay';
import CombatDisplay from './CombatDisplay';
import PhaseBar from './PhaseBar';
import LogDrawer from './LogDrawer';
import ContextMenu from './ContextMenu';
import TargetSelector from './TargetSelector';
import ChoicePanel from './ChoicePanel';
import RotateGate from './RotateGate';

export default function GameScreen() {
  const roomId = useGameStore((s) => s.roomId);
  const room = useGameStore((s) => s.room);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const gameOver = room?.status === 'gameOver';
  const outcome = room?.outcome;

  return (
    <>
      <RotateGate />
      <div className="game-screen">
        <div className="board-stage">
          <div className="board-top">
            <OpponentInfo />
            <div className="board-banner">
              <span className="board-banner-room">Room <strong>{roomId}</strong></span>
              {gameOver && (
                <div role="status" className="game-outcome">
                  <strong>{outcome?.type === 'draw' ? 'Draw' : outcome?.type === 'win'
                    ? (outcome.winnerId === myPlayerId ? 'You win' : 'You lose') : 'Game over'}</strong>
                  {outcome && <span> — {outcome.type === 'draw'
                    ? 'Both players reached zero or less life.'
                    : 'A player reached zero or less life.'}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="board-field" inert={gameOver || !!room?.pendingChoice}>
            <Battlefield center={<><StackDisplay /><CombatDisplay /></>} />
          </div>
          <div className="board-bottom">
            <PlayerInfo />
            <div className="board-pill">
              <PhaseBar />
              {!gameOver && <ChoicePanel />}
            </div>
          </div>
          <div className="hand-dock">
            <Hand />
          </div>
          <LogDrawer />
        </div>
        {!gameOver && !room?.pendingChoice && <ContextMenu />}
        {!gameOver && !room?.pendingChoice && <TargetSelector />}
      </div>
    </>
  );
}
