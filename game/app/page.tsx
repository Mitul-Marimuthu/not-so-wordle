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
  const [resultWord, setResultWord] = useState('');
  const [resultGuesses, setResultGuesses] = useState(0);
  // Ref mirrors inputLocked — lets the keydown listener check it synchronously
  // without waiting for a React re-render cycle.
  const isRevealingRef = useRef(false);
  // Word list loaded once into a Set for O(1) client-side validation.
  // Falls back to server-side validation if the fetch hasn't completed yet.
  const wordSetRef = useRef<Set<string>>(new Set());
  // Mirrors guesses so the poll interval can compare without re-creating on every guess.
  const guessesRef = useRef<GuessResult[]>([]);

  useEffect(() => {
    if (!session) return;
    api.getWords()
      .then(({ words }) => { wordSetRef.current = new Set(words); })
      .catch(() => {});
  }, [session]);

  // Keep ref in sync so the poll interval always sees the latest guesses.
  useEffect(() => { guessesRef.current = guesses; }, [guesses]);

  // Poll every 4 s while a game is in progress to sync guesses from other devices.
  useEffect(() => {
    if (!gameId || status !== 'in_progress') return;

    const intervalId = setInterval(async () => {
      if (isRevealingRef.current) return; // skip during local animation
      try {
        const game = await api.getGame(gameId);

        // Nothing changed — bail immediately to avoid any state updates
        // that could interfere with in-progress typing.
        if (game.guesses.length === guessesRef.current.length && game.status === 'in_progress') return;

        if (game.guesses.length > guessesRef.current.length) {
          setGuesses(game.guesses);
        }

        if (game.status !== 'in_progress') {
          setGuesses(game.guesses);
          setStatus(game.status);
          setResultWord(game.word ?? '');
          setResultGuesses(game.guesses.length);
          // Don't clear currentInput — the modal covers it, and initGame clears it on Play Again.
          clearStoredGameId();
        }
      } catch { /* network blip — try again next tick */ }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [gameId, status]);

  // Once auth is confirmed, start or restore a game.
  useEffect(() => {
    if (session) initGame();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function initGame(fresh = false) {
    // Optimistic reset only when explicitly starting fresh (Play Again).
    // Session-refetch restores must not wipe state the user is actively using.
    if (fresh) {
      setStatus('in_progress');
      setGuesses([]);
      setCurrentInput('');
      setGameId(null);
      setInputLocked(true);
    }

    try {
      const storedId = getStoredGameId();
      if (storedId) {
        const game = await api.getGame(storedId);
        if (game.status === 'in_progress') {
          setGuesses(game.guesses);
          setGameId(storedId);
          setInputLocked(false);
          return;
        }
      }
      // newGame now returns full state — no second fetch needed.
      const newGame = await api.newGame();
      setGuesses(newGame.guesses);
      setGameId(newGame.gameId);
      setStoredGameId(newGame.gameId);
      setInputLocked(false);
    } catch {
      showMessage('Could not start game. Is the backend running?', 4000);
      setInputLocked(false);
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
          if (data.status !== 'in_progress') {
            setResultWord(data.word ?? '');
            setResultGuesses(row + 1);
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

        {/* End-of-game modal */}
        {(status === 'won' || status === 'lost') && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl w-full max-w-sm">
              <p className="text-lg font-semibold text-gray-500 uppercase tracking-widest text-sm">
                {status === 'won' ? 'You got it!' : 'Better luck next time'}
              </p>
              <p className="text-6xl font-bold tracking-widest uppercase text-[#6aaa64]">
                {resultWord}
              </p>
              {status === 'won' && (
                <p className="text-gray-400 text-sm">{resultGuesses} / 6 guesses</p>
              )}
              <button
                onClick={() => initGame(true)}
                className="mt-2 w-full py-3 bg-[#6aaa64] text-white rounded-full font-semibold text-lg hover:bg-green-600 transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <GamePage />;
}
