const AUTH_STORAGE_KEY = 'game-tracking:auth';

export interface StoredAuthSession {
  token: string;
  expiresAt: string;
}

export function getStoredAuth(): StoredAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as StoredAuthSession;
    if (!session.token || !session.expiresAt) {
      clearStoredAuth();
      return null;
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      clearStoredAuth();
      return null;
    }

    return session;
  } catch {
    clearStoredAuth();
    return null;
  }
}

export function saveStoredAuth(session: StoredAuthSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAuthToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function isLocallyAuthenticated(): boolean {
  return getStoredAuth() !== null;
}

export function getAuthAuthorizationHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
