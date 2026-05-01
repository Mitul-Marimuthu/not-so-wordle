const GAME_ID_KEY = 'game_id';

export function getStoredGameId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GAME_ID_KEY);
}

export function setStoredGameId(id: string): void {
  localStorage.setItem(GAME_ID_KEY, id);
}

export function clearStoredGameId(): void {
  localStorage.removeItem(GAME_ID_KEY);
}
