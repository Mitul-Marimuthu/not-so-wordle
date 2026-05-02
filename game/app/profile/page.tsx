'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { User, SolvedEntry } from '@/lib/types';
import Header from '@/components/Header';

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session) { router.push('/'); return; }
    api.getProfile()
      .then(setUser)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
  }, [session, sessionStatus, router]);

  if (error) {
    const isAuthError = error.includes('401') || error.toLowerCase().includes('unauthorized');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-500 text-sm font-medium">
          {isAuthError ? 'Session out of date.' : 'Failed to load profile.'}
        </p>
        {isAuthError && (
          <p className="text-gray-400 text-sm text-center">
            Sign out and sign back in to refresh your session.
          </p>
        )}
        <p className="text-gray-300 text-xs font-mono">{error}</p>
      </div>
    );
  }
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  }

  return (
    <>
      <Header />
      <main className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-8">
        <div>
          <p className="text-xl font-bold">{user.name}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <StatBox label="Words Solved" value={user.totalSolved} />
          <StatBox label="Current Streak" value={user.currentStreak} />
          <StatBox label="Best Streak" value={user.longestStreak} />
        </div>

        {/* History */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Game History</h2>
          {user.history.length === 0 ? (
            <p className="text-gray-400 text-sm">No games completed yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...user.history].reverse().map((entry, i) => (
                <HistoryRow key={i} entry={entry} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function HistoryRow({ entry }: { entry: SolvedEntry }) {
  const date = new Date(entry.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <li className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
      <span className="font-mono font-bold uppercase tracking-widest text-[#6aaa64]">
        {entry.word}
      </span>
      <span className="text-sm text-gray-500">{entry.guesses} guess{entry.guesses !== 1 ? 'es' : ''}</span>
      <span className="text-xs text-gray-400">{date}</span>
    </li>
  );
}
