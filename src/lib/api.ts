// src/lib/api.ts
// Central fetch wrapper with:
// - Token refresh + 401 handling
// - Transient error retry via exponential backoff (429, 502, 503, 504, network failures)

import { auth } from './firebase.ts';
import { withBackoff, MAX_RETRIES } from './retry.ts';

interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  sessionExpired?: boolean;
  data?: T;
}

let currentToken: string | null = null;

export function setApiToken(token: string | null) {
  currentToken = token;
}

function dispatchSessionExpired() {
  window.dispatchEvent(new CustomEvent('session-expired'));
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // network failure
  if (err instanceof Error && err.name === 'AbortError') return true; // timeout
  if (err instanceof Error && isTransientStatus(parseInt(err.message.split(': ')[1] || '0'))) return true;
  return false;
}

async function parseBody<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  return withBackoff(
    async () => {
      const doFetch = async (token: string): Promise<Response> => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(url, { ...options, headers });
      };

      // Unauthenticated path — no retry on 401, just return directly
      if (!currentToken) {
        const response = await fetch(url, options);
        if (isTransientStatus(response.status)) {
          throw new Error(`Transient error: ${response.status}`);
        }
        const data = await parseBody<T>(response);
        return { ok: response.ok, status: response.status, data };
      }

      let response = await doFetch(currentToken);

      // Handle 401 — token refresh, not a retryable condition
      if (response.status === 401) {
        try {
          const user = auth.currentUser;
          if (!user) {
            dispatchSessionExpired();
            return { ok: false, status: 401, sessionExpired: true };
          }

          const newToken = await user.getIdToken(/* forceRefresh */ true);
          currentToken = newToken;
          response = await doFetch(currentToken);

          if (response.status === 401) {
            dispatchSessionExpired();
            return { ok: false, status: 401, sessionExpired: true };
          }
        } catch {
          dispatchSessionExpired();
          return { ok: false, status: 401, sessionExpired: true };
        }
      }

      // Retry on transient server errors
      if (isTransientStatus(response.status)) {
        throw new Error(`Transient error: ${response.status}`);
      }

      const data = await parseBody<T>(response);
      return { ok: response.ok, status: response.status, data };
    },
    {
      maxRetries: MAX_RETRIES,
      onRetry: (attempt, err) => {
        console.warn(`apiFetch retry ${attempt + 1}/${MAX_RETRIES} for ${url}:`, err);
      },
    },
  );
}
