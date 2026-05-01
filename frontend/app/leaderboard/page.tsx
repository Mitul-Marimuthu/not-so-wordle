'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { isLoggedIn } from '@/lib/auth';
import { LeaderboardEntry } from '@/lib/types';
import Header from '@/components/Header';

type Tab = 'streak' | 'total';

export default function LeaderboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('streak');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/');
      return;
    }
  }, [router]);

  useEffect(() => {
    setEntries([]);
    setError('');
    api.getLeaderboard(tab)
      .then(data => setEntries(data.leaderboard))
      .catch(() => setError('Failed to load leaderboard.'));
  }, [tab]);

  const tabLabel = tab === 'streak' ? 'Longest Streak' : 'Total Solved';

  return (
    <>
      <Header />
      <main className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Leaderboard</h1>

        {/* Tab switcher */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden w-fit">
          <TabButton label="Streak" active={tab === 'streak'} onClick={() => setTab('streak')} />
          <TabButton label="Total Solved" active={tab === 'total'} onClick={() => setTab('total')} />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Table */}
        {entries.length === 0 && !error ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map(entry => (
              <LeaderboardRow key={entry.rank} entry={entry} label={tabLabel} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 text-sm font-medium transition-colors ${
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
      <span className="text-sm text-gray-500">
        {entry.score} <span className="text-gray-400">{label}</span>
      </span>
    </li>
  );
}
