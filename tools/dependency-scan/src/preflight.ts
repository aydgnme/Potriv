/**
 * Whether the NVD API is actually reachable and authenticated, decided
 * before a multi-hour-if-wrong scan is ever started.
 *
 * The previous version of this gate checked only that a key string was
 * non-empty. A key that is present but expired, revoked, or simply wrong —
 * or an NVD outage, or a network path that cannot reach it at all — passed
 * that check and then depended entirely on `dependency-check-maven`'s own,
 * undocumented-here failure behaviour. This module makes each of those
 * outcomes an explicit, classified result, so the workflow step calling it
 * can fail for a *named* reason instead of an assumed one.
 *
 * Nothing here ever includes the API key's value in a thrown error, a log
 * line, or a returned {@link PreflightResult} — only which reason code
 * applies and safe metadata (an HTTP status, an elapsed time).
 */

export type PreflightReason =
  | 'missing-key'
  | 'unauthorized'
  | 'forbidden'
  | 'server-error'
  | 'network-error'
  | 'timeout';

export type PreflightResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PreflightReason; readonly detail: string };

export type PreflightOptions = {
  /** `undefined` or empty is treated identically: no key configured. */
  readonly apiKey: string | undefined;
  /** The NVD CVE API endpoint to probe. Overridable so tests never call the real service. */
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Retries apply only to transient outcomes (network error, timeout, 5xx) — never to 401/403. */
  readonly maxRetries: number;
  /** Delay before each retry. Kept short; this is a preflight, not the scan itself. */
  readonly retryDelayMs: number;
  /** Injectable so tests never perform a real network wait. Defaults to the real fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
};

const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function checkNvdPreflight(options: PreflightOptions): Promise<PreflightResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return { ok: false, reason: 'missing-key', detail: 'NVD_API_KEY is not set.' };
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? DEFAULT_SLEEP;

  let lastNetworkDetail = 'unknown network error';
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    if (attempt > 0) {
      await sleep(options.retryDelayMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchFn(options.baseUrl, {
        method: 'GET',
        headers: { apiKey },
        signal: controller.signal,
      });

      if (response.ok) {
        return { ok: true };
      }
      if (response.status === 401) {
        // Not retried: a rejected credential will not become valid by
        // asking again.
        return {
          ok: false,
          reason: 'unauthorized',
          detail: `NVD rejected the API key (HTTP 401).`,
        };
      }
      if (response.status === 403) {
        return {
          ok: false,
          reason: 'forbidden',
          detail: `NVD refused the request (HTTP 403).`,
        };
      }
      if (response.status >= 500) {
        lastNetworkDetail = `NVD returned HTTP ${response.status}.`;
        continue;
      }
      // Any other unexpected status is treated as a server-side problem
      // rather than guessed at further — not retried, since it is not one
      // of the two transient categories above.
      return {
        ok: false,
        reason: 'server-error',
        detail: `NVD returned an unexpected HTTP ${response.status}.`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastNetworkDetail = `Timed out after ${options.timeoutMs}ms.`;
        continue;
      }
      lastNetworkDetail = error instanceof Error ? error.message : String(error);
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  const reason: PreflightReason = lastNetworkDetail.startsWith('Timed out')
    ? 'timeout'
    : lastNetworkDetail.startsWith('NVD returned HTTP')
      ? 'server-error'
      : 'network-error';
  return {
    ok: false,
    reason,
    detail: `${lastNetworkDetail} (after ${options.maxRetries + 1} attempt(s))`,
  };
}
