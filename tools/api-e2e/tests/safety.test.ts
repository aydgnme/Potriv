import { afterEach, describe, expect, it } from 'vitest';

import { assertTargetIsSafe, isLocalTarget, loadConfig, newRunId } from '../src/config/env.js';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('safety guard', () => {
  it('recognises local targets', () => {
    expect(isLocalTarget('127.0.0.1')).toBe(true);
    expect(isLocalTarget('localhost')).toBe(true);
    expect(isLocalTarget('api.potriv.aydgn.me')).toBe(false);
  });

  it('refuses a remote target without an explicit opt-in', () => {
    process.env.API_BASE_URL = 'https://api.potriv.aydgn.me/api';
    expect(() => assertTargetIsSafe(loadConfig([]))).toThrow(/Refusing to run against non-local/);
  });

  it('still refuses mutation on a remote target allowed only for reading', () => {
    process.env.API_BASE_URL = 'https://api.potriv.aydgn.me/api';
    process.env.E2E_ALLOW_REMOTE = 'true';
    expect(() => assertTargetIsSafe(loadConfig([]))).toThrow(/mutating scenarios are not/);
  });

  it('permits a remote target only with both opt-ins', () => {
    process.env.API_BASE_URL = 'https://api.potriv.aydgn.me/api';
    process.env.E2E_ALLOW_REMOTE = 'true';
    process.env.E2E_ALLOW_DESTRUCTIVE_REMOTE = 'true';
    expect(() => assertTargetIsSafe(loadConfig([]))).not.toThrow();
  });

  it('mints a traceable run id', () => {
    expect(newRunId()).toMatch(/^qaapi-\d{14}-[0-9a-f]{6}$/);
  });
});
