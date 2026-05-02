import { Game, GuessResult, GuessResponse, User, LeaderboardResponse } from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
    request<{ gameId: string; status: string; guesses: GuessResult[]; startedAt: string }>('/api/games/new', { method: 'POST' }),

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

  getWords: () =>
    request<{ words: string[] }>('/api/words'),
};
