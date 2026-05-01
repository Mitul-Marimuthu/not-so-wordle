'use client';
import { GuessResult, TileState } from '@/lib/types';

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Enter','Z','X','C','V','B','N','M','←'],
];

// Green beats yellow beats gray — persist the best result seen for each letter.
const PRIORITY: Record<TileState, number> = { correct: 3, present: 2, absent: 1, filled: 0, empty: 0 };

function getLetterStates(guesses: GuessResult[]): Record<string, TileState> {
  const states: Record<string, TileState> = {};
  for (const { guess, result } of guesses) {
    for (let i = 0; i < 5; i++) {
      const letter = guess[i].toUpperCase();
      const state = result[i] === '+' ? 'correct' : result[i] === 'x' ? 'present' : 'absent';
      if (!states[letter] || PRIORITY[state] > PRIORITY[states[letter]]) {
        states[letter] = state;
      }
    }
  }
  return states;
}

const KEY_COLORS: Record<TileState, string> = {
  correct: 'bg-[#6aaa64] text-white border-[#6aaa64]',
  present: 'bg-[#c9b458] text-white border-[#c9b458]',
  absent:  'bg-[#787c7e] text-white border-[#787c7e]',
  filled:  'bg-gray-200 text-gray-900 border-gray-200',
  empty:   'bg-gray-200 text-gray-900 border-gray-200',
};

interface KeyboardProps {
  guesses: GuessResult[];
  onKey: (key: string) => void;
}

export default function Keyboard({ guesses, onKey }: KeyboardProps) {
  const letterStates = getLetterStates(guesses);

  return (
    <div className="flex flex-col items-center gap-1.5 w-full max-w-md px-1">
      {ROWS.map((row, i) => (
        <div key={i} className="flex gap-1 w-full justify-center">
          {row.map((key) => {
            const state = letterStates[key] ?? 'empty';
            const isWide = key === 'Enter' || key === '←';
            return (
              <button
                key={key}
                onClick={() => onKey(key === '←' ? 'Backspace' : key)}
                className={`
                  ${isWide ? 'flex-[1.5]' : 'flex-1'} h-14 rounded font-bold text-sm
                  border select-none cursor-pointer min-w-0
                  active:opacity-70 transition-colors
                  ${KEY_COLORS[state]}
                `}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
