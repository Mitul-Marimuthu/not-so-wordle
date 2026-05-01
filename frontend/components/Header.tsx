'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearToken, clearStoredGameId } from '@/lib/auth';

export default function Header() {
  const router = useRouter();

  function handleSignOut() {
    clearToken();
    clearStoredGameId();
    // Force a full navigation so the page re-checks auth state.
    window.location.href = '/';
  }

  return (
    <header className="w-full border-b border-gray-200">
      <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-widest uppercase">
          Not Wordle
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link href="/profile" className="text-gray-600 hover:text-gray-900 transition-colors">
            Profile
          </Link>
          <Link href="/leaderboard" className="text-gray-600 hover:text-gray-900 transition-colors">
            Leaderboard
          </Link>
          <button onClick={handleSignOut} className="text-gray-400 hover:text-gray-600 transition-colors">
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
