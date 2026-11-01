import { useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, selectMyBattlefield, selectOpponentBattlefield } from '../store/gameStore';
import PermanentHalf from './board/PermanentHalf';
import { CardPreview, type PreviewRequest } from './board/CardPreview';

/**
 * The battlefield: two halves of felt with the stack and combat on the front
 * line between them. `center` renders only when it has something to say, so an
 * empty stack costs no vertical space.
 */
export default function Battlefield({ center }: { center?: ReactNode } = {}) {
  const myBattlefield = useGameStore(useShallow(selectMyBattlefield));
  const opponentBattlefield = useGameStore(useShallow(selectOpponentBattlefield));
  const [preview, setPreview] = useState<PreviewRequest | null>(null);

  return (
    <div className="battlefield">
      <h2 className="sr-only">Permanents</h2>
      <PermanentHalf cards={opponentBattlefield} side="opponent" onPreview={setPreview} />
      {center && <div className="battlefield-center">{center}</div>}
      <PermanentHalf cards={myBattlefield} side="you" onPreview={setPreview} />
      {preview && <CardPreview card={preview.card} rect={preview.rect} />}
    </div>
  );
}