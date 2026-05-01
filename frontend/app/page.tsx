'use client';
import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { setToken, getToken, setStoredGameId, getStoredGameId, clearStoredGameId } from '@/lib/auth';
import { GuessResult, GameStatus } from '@/lib/types';
import GameBoard from '@/components/GameBoard';
import Keyboard from '@/components/Keyboard';
import Header from '@/components/Header';

// Total time for all 5 tiles to finish flipping: 4 × 300 ms stagger + 600 ms animation.
const REVEAL_DURATION = 4 * 300 + 600;

function GamePage() {
  const searchParams = useSearchParams();

  // null = still checking localStorage; true/false = settled
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [status, setStatus] = useState<GameStatus>('in_progress');
  const [revealingRow, setRevealingRow] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(false);

  // Handle the ?token= query param the Go backend appends after OAuth.
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      window.history.replaceState({}, '', '/');
    }
    setAuthed(!!getToken());
  }, [searchParams]);

  // Once auth is confirmed, start or restore a game.
  useEffect(() => {
    if (authed) initGame();
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setGameId(newId);
      setStoredGameId(newId);
      setGuesses([]);
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
    if (status !== 'in_progress' || revealingRow !== null) return;

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
      try {
        const row = guesses.length;
        const data = await api.submitGuess(gameId!, currentInput);

        setRevealingRow(row);
        setGuesses(prev => [
          ...prev,
          { guess: currentInput, result: data.result, timestamp: new Date().toISOString() },
        ]);
        setCurrentInput('');

        setTimeout(() => {
          setRevealingRow(null);
          setStatus(data.status);
          if (data.status === 'won') {
            showMessage('Brilliant! 🎉', 3000);
            clearStoredGameId();
          } else if (data.status === 'lost') {
            showMessage(`The word was: ${data.word?.toUpperCase()}`, 4000);
            clearStoredGameId();
          }
        }, REVEAL_DURATION);
      } catch (err: unknown) {
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
  }, [status, revealingRow, currentInput, gameId, guesses]);

  // Physical keyboard listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      handleKeyPress(e.key);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKeyPress]);

  if (authed === null) return null;

  if (!authed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-5xl font-bold tracking-widest uppercase">Not Wordle</h1>
        <p className="text-gray-500 text-center">Unlimited play. Real streaks. Global leaderboard.</p>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}
          className="px-8 py-3 bg-[#6aaa64] text-white rounded-full font-semibold text-lg hover:bg-green-600 transition-colors"
        >
          Sign in with Google
        </a>
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
        <Keyboard guesses={guesses} onKey={handleKeyPress} />
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

// useSearchParams requires a Suspense boundary in the Next.js App Router.
export default function Page() {
  return (
    <Suspense>
      <GamePage />
    </Suspense>
  );
}
