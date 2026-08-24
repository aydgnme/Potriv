import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { checkNvdPreflight } from '../src/preflight.js';

/**
 * Every scenario here runs against a local, ephemeral HTTP server (or a port
 * nothing is listening on) — never the real NVD service. That is the actual
 * point of this file: "invalid key", "NVD unreachable" and "NVD returns a
 * server error" have to be provable in this repository, deterministically,
 * without a real API key or network access to a third party.
 */

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

function startServer(
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void,
): string {
  server = createServer(handler);
  server.listen(0);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/`;
}

const FAST = { timeoutMs: 500, maxRetries: 1, retryDelayMs: 5 };

describe('missing key', () => {
  it('fails immediately, with no network call at all', async () => {
    let called = false;
    const baseUrl = startServer((_req, res) => {
      called = true;
      res.writeHead(200).end('{}');
    });

    const result = await checkNvdPreflight({ apiKey: undefined, baseUrl, ...FAST });

    expect(result).toEqual({ ok: false, reason: 'missing-key', detail: expect.any(String) });
    expect(called).toBe(false);
  });

  it('treats a blank key the same as an absent one', async () => {
    const baseUrl = startServer((_req, res) => res.writeHead(200).end('{}'));

    const result = await checkNvdPreflight({ apiKey: '   ', baseUrl, ...FAST });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-key');
  });
});

describe('a real key, classified by the response', () => {
  it('accepts a 200', async () => {
    const baseUrl = startServer((_req, res) => res.writeHead(200).end('{"totalResults":0}'));

    const result = await checkNvdPreflight({ apiKey: 'a-key', baseUrl, ...FAST });

    expect(result).toEqual({ ok: true });
  });

  it('never sends the key value in a way this test cannot also see, and never leaks it into the result', async () => {
    let sawHeader: string | undefined;
    const baseUrl = startServer((req, res) => {
      sawHeader = req.headers.apikey as string | undefined;
      res.writeHead(200).end('{}');
    });

    const secret = 'super-secret-nvd-key-0123456789';
    const result = await checkNvdPreflight({ apiKey: secret, baseUrl, ...FAST });

    expect(sawHeader).toBe(secret); // sent, correctly, as a header
    expect(JSON.stringify(result)).not.toContain(secret); // never echoed back
  });

  it('rejects a 401 as unauthorized, without retrying', async () => {
    let calls = 0;
    const baseUrl = startServer((_req, res) => {
      calls += 1;
      res.writeHead(401).end('Unauthorized');
    });

    const result = await checkNvdPreflight({ apiKey: 'wrong-key', baseUrl, ...FAST });

    expect(result).toEqual({ ok: false, reason: 'unauthorized', detail: expect.any(String) });
    expect(calls).toBe(1);
  });

  it('rejects a 403 as forbidden, without retrying', async () => {
    let calls = 0;
    const baseUrl = startServer((_req, res) => {
      calls += 1;
      res.writeHead(403).end('Forbidden');
    });

    const result = await checkNvdPreflight({ apiKey: 'revoked-key', baseUrl, ...FAST });

    expect(result).toEqual({ ok: false, reason: 'forbidden', detail: expect.any(String) });
    expect(calls).toBe(1);
  });

  it('retries a 5xx up to the configured limit, then fails as server-error', async () => {
    let calls = 0;
    const baseUrl = startServer((_req, res) => {
      calls += 1;
      res.writeHead(503).end('Service Unavailable');
    });

    const result = await checkNvdPreflight({ apiKey: 'a-key', baseUrl, ...FAST });

    expect(result).toEqual({ ok: false, reason: 'server-error', detail: expect.any(String) });
    expect(calls).toBe(FAST.maxRetries + 1);
  });

  it('recovers if a later retry succeeds after an initial 5xx', async () => {
    let calls = 0;
    const baseUrl = startServer((_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.writeHead(503).end('Service Unavailable');
        return;
      }
      res.writeHead(200).end('{}');
    });

    const result = await checkNvdPreflight({ apiKey: 'a-key', baseUrl, ...FAST });

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('classifies a connection to nothing listening as a network error', async () => {
    // Port 1 is a reserved, well-known-unused port: nothing is listening on
    // it in any CI or dev environment, so the connection is refused
    // immediately and deterministically — no real network dependency.
    const result = await checkNvdPreflight({
      apiKey: 'a-key',
      baseUrl: 'http://127.0.0.1:1/',
      ...FAST,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network-error');
  });

  it('classifies a server that never responds as a timeout', async () => {
    const baseUrl = startServer(() => {
      // Deliberately never call res.end() or res.writeHead() — the request
      // just hangs until this test's own AbortController timeout fires.
    });

    const result = await checkNvdPreflight({
      apiKey: 'a-key',
      baseUrl,
      timeoutMs: 100,
      maxRetries: 0,
      retryDelayMs: 5,
    });

    expect(result).toEqual({ ok: false, reason: 'timeout', detail: expect.any(String) });
  });
});
