'use client';
import { useEffect, useState } from 'react';
import { TileState } from '@/lib/types';

interface TileProps {
  letter: string;
  state: TileState;
  position: number;   // 0-4, used to stagger the flip
  animating: boolean; // true while this row is being revealed
}

const COLORS: Record<TileState, string> = {
  empty:   'border-2 border-gray-200 bg-white text-gray-900',
  filled:  'border-2 border-gray-500 bg-white text-gray-900',
  correct: 'border-2 border-[#6aaa64] bg-[#6aaa64] text-white',
  present: 'border-2 border-[#c9b458] bg-[#c9b458] text-white',
  absent:  'border-2 border-[#787c7e] bg-[#787c7e] text-white',
};

const isResult = (s: TileState) => s === 'correct' || s === 'present' || s === 'absent';

const STAGGER = 300;   // ms between tiles
const DURATION = 600;  // ms per tile flip

export default function Tile({ letter, state, position, animating }: TileProps) {
  // `revealed` lags behind `state` so the colour swap happens while the tile
  // is edge-on (scaleY 0) and invisible to the player.
  const [revealed, setRevealed] = useState<TileState>(state);

  useEffect(() => {
    if (isResult(state) && animating) {
      const mid = position * STAGGER + DURATION / 2;
      const t = setTimeout(() => setRevealed(state), mid);
      return () => clearTimeout(t);
    } else {
      setRevealed(state);
    }
  }, [state, animating, position]);

  const flipStyle = animating && isResult(state)
    ? { animation: `tile-flip ${DURATION}ms ease ${position * STAGGER}ms both` }
    : undefined;

  const popStyle = state === 'filled' && letter
    ? { animation: 'pop 0.1s ease' }
    : undefined;

  return (
    <div
      className={`w-14 h-14 flex items-center justify-center text-2xl font-bold uppercase select-none ${COLORS[revealed]}`}
      style={{ willChange: 'transform', ...(flipStyle ?? popStyle) }}
    >
      {letter}
    </div>
  );
}
