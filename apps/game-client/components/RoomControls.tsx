import { useGameStore } from '../store/gameStore';
import { useGameActions } from '../hooks/useGameActions';

/** Explicit exits are available even while an opponent owns priority or a choice is open. */
export default function RoomControls() {
  const room = useGameStore(state => state.room);
  const { playerAction, leaveRoom } = useGameActions();
  const active = !!room?.player2Id && (room.status === 'playing' || room.status === 'RPS');
  return <div className="room-controls">
    {active && <button onClick={() => {
      if (window.confirm('Concede this match? Your opponent will win.')) playerAction('concede');
    }}>Concede</button>}
    <button onClick={() => {
      if (!active || window.confirm('Leave this room and concede the match?')) leaveRoom();
    }}>{active ? 'Concede and leave' : 'Leave room'}</button>
  </div>;
}
