import { Game, GuessResponse, User, LeaderboardResponse } from './types';
import { getToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }

  return res.json() as Promise<T>;
}

export const api = {
  newGame: () =>
    request<{ gameId: string; status: string }>('/api/games/new', { method: 'POST' }),

  getGame: (id: string) =>
    request<Game>(`/api/games/${id}`),

  submitGuess: (id: string, guess: string) =>
    request<GuessResponse>(`/api/games/${id}/guess`, {
      method: 'POST',
      body: JSON.stringify({ guess }),
    }),

  getProfile: () =>
    request<User>('/api/profile'),

  getLeaderboard: (type: 'streak' | 'total') =>
    request<LeaderboardResponse>(`/api/leaderboard/${type}`),
};
