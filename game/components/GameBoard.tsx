'use client';
import { GuessResult, TileState } from '@/lib/types';
import Tile from './Tile';

interface GameBoardProps {
  guesses: GuessResult[];
  currentInput: string;
  revealingRow: number | null;
  shake: boolean;
}

function resultToState(r: string): TileState {
  if (r === '+') return 'correct';
  if (r === 'x') return 'present';
  return 'absent';
}

export default function GameBoard({ guesses, currentInput, revealingRow, shake }: GameBoardProps) {
  return (
    <div className="flex flex-col gap-1.5 my-4">
      {Array.from({ length: 6 }, (_, row) => {
        const submitted = guesses[row];
        const isCurrentRow = row === guesses.length;
        const isAnimating = revealingRow === row;
        const isShaking = shake && isCurrentRow;

        return (
          <div key={row} className={`flex gap-1.5 ${isShaking ? 'shake' : ''}`}>
            {Array.from({ length: 5 }, (_, col) => {
              let letter = '';
              let state: TileState = 'empty';

              if (submitted) {
                letter = submitted.guess[col];
                state = resultToState(submitted.result[col]);
              } else if (isCurrentRow) {
                letter = currentInput[col] ?? '';
                state = letter ? 'filled' : 'empty';
              }

              return (
                <Tile
                  key={col}
                  letter={letter}
                  state={state}
                  position={col}
                  animating={isAnimating}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
