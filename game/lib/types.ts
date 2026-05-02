export type TileState = 'empty' | 'filled' | 'correct' | 'present' | 'absent';
export type GameStatus = 'in_progress' | 'won' | 'lost';

export interface GuessResult {
  guess: string;
  result: string[]; // "+" = correct, "x" = present, "-" = absent
  timestamp: string;
}

export interface Game {
  id: string;
  guesses: GuessResult[];
  status: GameStatus;
  startedAt: string;
  word?: string; // only present when status !== 'in_progress'
}

export interface GuessResponse {
  result: string[];
  status: GameStatus;
  guessNumber: number;
  word?: string; // only revealed when the game ends
}

export interface SolvedEntry {
  word: string;
  date: string;
  guesses: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
  history: SolvedEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: string;
  score: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}
