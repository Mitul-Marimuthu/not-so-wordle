'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { LeaderboardEntry } from '@/lib/types';
import Header from '@/components/Header';

type Tab = 'streak' | 'total';

export default function LeaderboardPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [tab, setTab] = useState<Tab>('streak');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session) { router.push('/'); return; }
  }, [session, sessionStatus, router]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getLeaderboard(tab)
      .then(data => setEntries(data.leaderboard))
      .catch(() => setError('Failed to load leaderboard.'))
      .finally(() => setLoading(false));
  }, [tab]);

  const tabLabel = tab === 'streak' ? 'Longest Streak' : 'Total Solved';

  return (
    <>
      <Header />
      <main className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Leaderboard</h1>

        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          <TabButton label="Streak" active={tab === 'streak'} onClick={() => setTab('streak')} />
          <div className="w-px bg-gray-200 shrink-0" />
          <TabButton label="Total Solved" active={tab === 'total'} onClick={() => setTab('total')} />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Fixed-height container so the layout never shifts during fetch. */}
        <div className="relative min-h-[420px]">
          <ul className={`flex flex-col gap-2 transition-opacity duration-200 ${loading ? 'opacity-40' : 'opacity-100'}`}>
            {entries.map(entry => (
              <LeaderboardRow key={entry.rank} entry={entry} label={tabLabel} />
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-sm font-medium transition-colors outline-none ${
        active ? 'bg-[#6aaa64] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function LeaderboardRow({ entry, label }: { entry: LeaderboardEntry; label: string }) {
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return (
    <li className="flex items-center gap-4 border border-gray-100 rounded-lg px-4 py-3">
      <span className="w-6 text-center font-bold text-gray-400">
        {medals[entry.rank] ?? entry.rank}
      </span>
      <span className="flex-1 font-medium">{entry.name}</span>
      <span className="text-sm text-gray-500 text-right w-36 shrink-0">
        {entry.score} <span className="text-gray-400">{label}</span>
      </span>
    </li>
  );
}
