const TOKEN_KEY = 'auth_token';
const GAME_ID_KEY = 'game_id';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

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

export function isLoggedIn(): boolean {
  return !!getToken();
}
