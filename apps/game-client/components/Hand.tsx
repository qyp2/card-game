import { useShallow } from 'zustand/react/shallow';
import { useGameStore, selectMyHand } from '../store/gameStore';
import CardComponent from './CardComponent';

/**
 * Cards fan out from the centre; the arc tightens as the hand grows and the
 * overlap deepens, so a twelve-card hand still fits the bottom edge without
 * shrinking the cards themselves.
 */
function fanStyle(index: number, count: number) {
  const middle = (count - 1) / 2;
  const offset = index - middle;
  const spread = count > 1 ? Math.min(6, 34 / count) : 0;
  const overlap = count > 9 ? '-4.2rem' : count > 7 ? '-3.2rem' : count > 5 ? '-1.8rem' : '-0.5rem';
  return {
    '--rot': `${offset * spread}deg`,
    '--lift': `${Math.abs(offset) ** 2 * 1.2}px`,
    '--overlap': overlap,
    '--deal-delay': `${Math.min(index, 14) * 42}ms`,
    zIndex: index + 1,
  } as React.CSSProperties;
}

export default function Hand() {
  const hand = useGameStore(useShallow(selectMyHand));

  return (
    <div className="hand">
      <h3>Your Hand ({hand.length})</h3>
      <div className="hand-cards">
        {hand.map((card, index) => (
          <div className="hand-card" key={card.uuid} style={fanStyle(index, hand.length)}>
            <CardComponent card={card} zone="hand" />
          </div>
        ))}
      </div>
    </div>
  );
}