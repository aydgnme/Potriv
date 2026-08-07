import { randomUUID } from 'node:crypto';

import type { Config } from '../config/env.js';
import { redactHeaders, summarize } from './redaction.js';

/**
 * The single HTTP client. Every request the suite makes goes through here so
 * timing, correlation and redaction are uniform and nothing can hang forever.
 */

export type Actor = {
  readonly name: string;
  readonly role: string;
  readonly token?: string;
  readonly cookies?: string;
};

export const ANONYMOUS: Actor = { name: 'anonymous', role: 'ANONYMOUS' };

export type RequestOptions = {
  readonly actor?: Actor;
  readonly body?: unknown;
  readonly form?: Record<string, string>;
  readonly query?: Record<string, string | number | undefined>;
  readonly headers?: Record<string, string>;
  readonly requestId?: string;
  readonly timeoutMs?: number;
  readonly accept?: string;
};

export type ApiResponse = {
  readonly method: string;
  readonly path: string;
  readonly url: string;
  readonly status: number;
  readonly ok: boolean;
  readonly elapsedMs: number;
  readonly requestId: string | null;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly text: string;
  readonly setCookie: string | null;
  /** Already-redacted summaries, safe for any report. */
  readonly redacted: { request: string; response: string };
};

export class ApiClient {
  private readonly timings: Array<{ method: string; path: string; ms: number }> = [];

  constructor(private readonly config: Config) {}

  get requestTimings(): ReadonlyArray<{ method: string; path: string; ms: number }> {
    return this.timings;
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      accept: options.accept ?? 'application/json',
      ...options.headers,
    };

    const actor = options.actor ?? ANONYMOUS;
    if (actor.token) headers.authorization = `Bearer ${actor.token}`;
    if (actor.cookies) headers.cookie = actor.cookies;
    if (options.requestId !== undefined) headers['x-request-id'] = options.requestId;

    let payload: string | undefined;
    if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(options.form).toString();
    } else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.config.requestTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: payload,
        redirect: 'manual',
        signal: controller.signal,
      });
      const elapsedMs = Math.round(performance.now() - started);
      const text = await response.text();
      this.timings.push({ method, path, ms: elapsedMs });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        method,
        path,
        url,
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        elapsedMs,
        requestId: response.headers.get('x-request-id'),
        headers: redactHeaders(responseHeaders),
        body: parseJson(text),
        text,
        setCookie: response.headers.get('set-cookie'),
        redacted: { request: summarize(options.body ?? options.form), response: summarize(text) },
      };
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started);
      this.timings.push({ method, path, ms: elapsedMs });
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        method,
        path,
        url,
        status: 0,
        ok: false,
        elapsedMs,
        requestId: null,
        headers: {},
        body: null,
        text: aborted ? `request timed out after ${timeoutMs}ms` : String(error),
        setCookie: null,
        redacted: {
          request: summarize(options.body ?? options.form),
          response: aborted ? `timeout>${timeoutMs}ms` : 'transport error',
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  get(path: string, options?: RequestOptions) { return this.request('GET', path, options); }
  post(path: string, options?: RequestOptions) { return this.request('POST', path, options); }
  put(path: string, options?: RequestOptions) { return this.request('PUT', path, options); }
  patch(path: string, options?: RequestOptions) { return this.request('PATCH', path, options); }
  delete(path: string, options?: RequestOptions) { return this.request('DELETE', path, options); }

  /** Absolute URL, for the OpenAPI document and other non-/api routes. */
  async absolute(method: string, url: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const origin = new URL(this.config.baseUrl).origin;
    const path = url.startsWith('http') ? url : `${origin}${url}`;
    const saved = this.config.baseUrl;
    // Reuse the same pipeline by temporarily treating the URL as absolute.
    return this.requestAbsolute(method, path, options, saved);
  }

  private async requestAbsolute(
    method: string,
    absoluteUrl: string,
    options: RequestOptions,
    _base: string,
  ): Promise<ApiResponse> {
    const relative = absoluteUrl.replace(new URL(this.config.baseUrl).origin, '');
    const client = new ApiClient({ ...this.config, baseUrl: new URL(this.config.baseUrl).origin });
    const response = await client.request(method, relative, options);
    this.timings.push({ method, path: relative, ms: response.elapsedMs });
    return response;
  }

  newRequestId(): string {
    return randomUUID().slice(0, 8);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
