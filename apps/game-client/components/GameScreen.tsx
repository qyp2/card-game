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
import CardObservations from './CardObservations';
import RotateGate from './RotateGate';
import RoomControls from './RoomControls';

export default function GameScreen() {
  const roomId = useGameStore((s) => s.roomId);
  const room = useGameStore((s) => s.room);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const gameOver = room?.status === 'gameOver';
  const outcome = room?.outcome;
  const finishTitle = outcome?.type === 'draw' ? 'Draw' : outcome?.type === 'win'
    ? (outcome.winnerId === myPlayerId ? 'Victory' : 'Defeat') : 'Game over';
  const finishDetail = outcome?.type === 'draw'
    ? 'Both players reached zero or less life.'
    : outcome?.losses.some(loss => loss.reason === 'concede') ? 'A player conceded.'
    : outcome?.losses.some(loss => loss.reason === 'failed_draw') ? 'A player could not draw a card.'
    : outcome ? 'A player reached zero or less life.' : '';

  // A soft light follows the pointer across the felt. Writing CSS variables
  // instead of state keeps the board's React tree completely still.
  const trackTableLight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    element.style.setProperty('--table-light-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    element.style.setProperty('--table-light-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
  };

  const resetTableLight = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--table-light-x', '50%');
    event.currentTarget.style.setProperty('--table-light-y', '42%');
  };

  return (
    <>
      <RotateGate />
      <div className="game-screen">
        <div className="board-stage" onPointerMove={trackTableLight} onPointerLeave={resetTableLight}>
          <div className="board-top">
            <OpponentInfo />
            <div className="board-banner">
              <span className="board-banner-room">Room <strong>{roomId}</strong></span>
              <RoomControls />
              {gameOver && (
                <div role="status" className="game-outcome">
                  <strong>{outcome?.type === 'draw' ? 'Draw' : outcome?.type === 'win'
                    ? (outcome.winnerId === myPlayerId ? 'You win' : 'You lose') : 'Game over'}</strong>
                  {outcome && <span> — {outcome.type === 'draw'
                    ? 'Both players reached zero or less life.'
                    : outcome.losses.some(loss => loss.reason === 'concede') ? 'A player conceded.'
                    : outcome.losses.some(loss => loss.reason === 'failed_draw') ? 'A player could not draw a card.'
                    : 'A player reached zero or less life.'}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="board-field" inert={gameOver || !!room?.pendingChoice}>
            <Battlefield center={<><StackDisplay /><CombatDisplay /></>} />
            {gameOver && (
              <div className={`game-finish game-finish-${outcome?.type === 'draw' ? 'draw' : outcome?.type === 'win' ? (outcome.winnerId === myPlayerId ? 'victory' : 'defeat') : 'neutral'}`} aria-hidden="true">
                <span className="game-finish-halo" />
                <p className="game-finish-kicker">{outcome?.type === 'draw' ? 'The table is level' : 'The final card is played'}</p>
                <h2>{finishTitle}</h2>
                <p>{finishDetail}</p>
              </div>
            )}
          </div>
          <div className="board-bottom">
            <PlayerInfo />
            <div className="board-pill">
              <PhaseBar />
              <CardObservations />
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
