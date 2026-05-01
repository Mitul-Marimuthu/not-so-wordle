'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { api } from '@/lib/api';
import { setStoredGameId, getStoredGameId, clearStoredGameId } from '@/lib/auth';
import { GuessResult, GameStatus } from '@/lib/types';
import GameBoard from '@/components/GameBoard';
import Keyboard from '@/components/Keyboard';
import Header from '@/components/Header';

// Total time for all 5 tiles to finish flipping: 4 × 300 ms stagger + 600 ms animation.
const REVEAL_DURATION = 4 * 300 + 600;

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
  // Ref mirrors inputLocked so the keydown listener can check it synchronously
  // without waiting for a React re-render cycle.
  const isRevealingRef = useRef(false);

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
    // isRevealingRef is checked synchronously here — unlike the revealingRow
    // state, the ref is updated the instant the animation starts so there is
    // no window where a stale closure can slip a guess through.
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
      // Lock before the API call so a second Enter during the network
      // round-trip can't slip through (ref = physical keyboard, state = on-screen button).
      isRevealingRef.current = true;
      setInputLocked(true);
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
        }, REVEAL_DURATION);
      } catch (err: unknown) {
        // Unlock on error so the player can try again.
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

  // Still checking session — render nothing to avoid flicker.
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
        <Keyboard guesses={guesses} onKey={handleKeyPress} locked={inputLocked} />
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
