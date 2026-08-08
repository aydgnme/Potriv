/**
 * Dev-console access token storage. localStorage only — convenient for local
 * testing, never used for production auth. The token is always masked in UI.
 */
const STORAGE_KEY = "potriv.console.accessToken";

type Listener = () => void;

const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, trimmed);
  notify();
}

export function clearToken(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function maskToken(token: string): string {
  if (token.length <= 12) {
    return "••••••••";
  }
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/** Subscribe to token changes; returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
