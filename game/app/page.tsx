'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { api } from '@/lib/api';
import { setStoredGameId, getStoredGameId, clearStoredGameId } from '@/lib/auth';
import { GuessResult, GameStatus } from '@/lib/types';
import GameBoard from '@/components/GameBoard';
import Keyboard from '@/components/Keyboard';
import Header from '@/components/Header';

// Must match STAGGER / DURATION in Tile.tsx.
const REVEAL_TOTAL = 4 * 300 + 600; // 1800 ms — last tile finishes at this point

function GamePage() {
  const { data: session, status: sessionStatus } = useSession();

  const [gameId, setGameId] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [status, setStatus] = useState<GameStatus>('in_progress');
  const [revealingRow, setRevealingRow] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  // Ref mirrors inputLocked — lets the keydown listener check it synchronously
  // without waiting for a React re-render cycle.
  const isRevealingRef = useRef(false);
  // Word list loaded once into a Set for O(1) client-side validation.
  // Falls back to server-side validation if the fetch hasn't completed yet.
  const wordSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    api.getWords()
      .then(({ words }) => { wordSetRef.current = new Set(words); })
      .catch(() => {});
  }, [session]);

  // Once auth is confirmed, start or restore a game.
  useEffect(() => {
    if (session) initGame();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function initGame() {
    try {
      const storedId = getStoredGameId();
      if (storedId) {
        const game = await api.getGame(storedId);
        if (game.status === 'in_progress') {
          setGameId(storedId);
          setGuesses(game.guesses);
          setStatus('in_progress');
          setCurrentInput('');
          return;
        }
      }
      const { gameId: newId } = await api.newGame();
      const game = await api.getGame(newId);
      setGameId(newId);
      setStoredGameId(newId);
      setGuesses(game.guesses);
      setStatus('in_progress');
      setCurrentInput('');
    } catch {
      showMessage('Could not start game. Is the backend running?', 4000);
    }
  }

  function showMessage(msg: string, duration = 1800) {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  }

  const handleKeyPress = useCallback(async (key: string) => {
    if (status !== 'in_progress' || isRevealingRef.current) return;

    if (key === 'Backspace') {
      setCurrentInput(prev => prev.slice(0, -1));
      return;
    }

    if (key === 'Enter') {
      if (currentInput.length < 5) {
        showMessage('Not enough letters');
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      }

      // O(1) client-side check — if the word list has loaded and the word
      // isn't in it, reject immediately with no animation.
      if (wordSetRef.current.size > 0 && !wordSetRef.current.has(currentInput)) {
        showMessage('Not in word list');
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      }

      isRevealingRef.current = true;
      setInputLocked(true);

      try {
        const row = guesses.length;
        const data = await api.submitGuess(gameId!, currentInput);

        setGuesses(prev => [
          ...prev,
          { guess: currentInput, result: data.result, timestamp: new Date().toISOString() },
        ]);
        setRevealingRow(row);
        setCurrentInput('');

        setTimeout(() => {
          isRevealingRef.current = false;
          setInputLocked(false);
          setRevealingRow(null);
          setStatus(data.status);
          if (data.status === 'won') {
            showMessage('Brilliant! 🎉', 3000);
            clearStoredGameId();
          } else if (data.status === 'lost') {
            showMessage(`The word was: ${data.word?.toUpperCase()}`, 4000);
            clearStoredGameId();
          }
        }, REVEAL_TOTAL);
      } catch (err: unknown) {
        isRevealingRef.current = false;
        setInputLocked(false);
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        if (msg.includes('not a valid word')) {
          showMessage('Not in word list');
        } else {
          showMessage(msg);
        }
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
      return;
    }

    if (/^[a-zA-Z]$/.test(key) && currentInput.length < 5) {
      setCurrentInput(prev => prev + key.toLowerCase());
    }
  }, [status, currentInput, gameId, guesses]);

  // Physical keyboard listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      handleKeyPress(e.key);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKeyPress]);

  if (sessionStatus === 'loading') return null;

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-5xl font-bold tracking-widest uppercase">Not Wordle</h1>
        <p className="text-gray-500 text-center">Unlimited play. Real streaks. Global leaderboard.</p>
        <button
          onClick={() => signIn('google')}
          className="px-8 py-3 bg-[#6aaa64] text-white rounded-full font-semibold text-lg hover:bg-green-600 transition-colors"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  return (
    <>
      <Header />
      <main className="flex flex-col items-center pb-8">
        {message && (
          <div className="fixed top-16 left-1/2 fade-in bg-gray-900 text-white px-4 py-2 rounded-lg font-medium z-50 text-sm pointer-events-none">
            {message}
          </div>
        )}
        <GameBoard
          guesses={guesses}
          currentInput={currentInput}
          revealingRow={revealingRow}
          shake={shake}
        />
        <Keyboard guesses={guesses} revealingRow={revealingRow} onKey={handleKeyPress} locked={inputLocked} />
        {(status === 'won' || status === 'lost') && (
          <button
            onClick={initGame}
            className="mt-6 px-8 py-2.5 bg-[#6aaa64] text-white rounded-full font-semibold hover:bg-green-600 transition-colors"
          >
            Play Again
          </button>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <GamePage />;
}
