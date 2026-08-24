import { describe, expect, it } from 'vitest';

import { buildFreshnessRecord, checkFreshness } from '../src/freshness.js';

const NOW = new Date('2026-08-24T12:00:00Z');
const MAX_AGE_DAYS = 10;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('no cache hit (a fresh environment, or a changed cache key)', () => {
  it('is never a failure, even with no metadata at all', () => {
    const result = checkFreshness(undefined, NOW, MAX_AGE_DAYS, false);
    expect(result).toEqual({ ok: true, reason: 'no-cache-hit' });
  });

  it('is never a failure even if a stale record happens to be present', () => {
    // Belt and suspenders: cacheHit is the authority, not the record's own age.
    const stale = buildFreshnessRecord(new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000));
    const result = checkFreshness(stale, NOW, MAX_AGE_DAYS, false);
    expect(result.ok).toBe(true);
  });
});

describe('a cache hit', () => {
  it('fails when no freshness record exists', () => {
    const result = checkFreshness(undefined, NOW, MAX_AGE_DAYS, true);
    expect(result).toEqual({ ok: false, reason: 'missing', detail: expect.any(String) });
  });

  it('fails when the record is blank', () => {
    const result = checkFreshness('   ', NOW, MAX_AGE_DAYS, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing');
  });

  it('fails when the record is not valid JSON', () => {
    const result = checkFreshness('{ not json', NOW, MAX_AGE_DAYS, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('corrupt');
  });

  it('fails when the record has no lastVerifiedUtc field', () => {
    const result = checkFreshness(JSON.stringify({ somethingElse: true }), NOW, MAX_AGE_DAYS, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('corrupt');
  });

  it('fails when lastVerifiedUtc does not parse as a date', () => {
    const result = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: 'not-a-date' }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('corrupt');
  });

  it('passes when the record is within the max age', () => {
    const result = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(3) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(result).toEqual({ ok: true, reason: 'within-max-age' });
  });

  it('fails when the record is older than the max age', () => {
    const result = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(45) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(result).toEqual({ ok: false, reason: 'stale', detail: expect.any(String) });
  });

  it('treats the boundary itself correctly, both sides', () => {
    const justInside = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(MAX_AGE_DAYS - 0.01) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    const justOutside = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(MAX_AGE_DAYS + 0.01) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(justInside.ok).toBe(true);
    expect(justOutside.ok).toBe(false);
  });
});

describe('buildFreshnessRecord', () => {
  it('round-trips through checkFreshness as fresh', () => {
    const record = buildFreshnessRecord(NOW);
    const result = checkFreshness(record, NOW, MAX_AGE_DAYS, true);
    expect(result).toEqual({ ok: true, reason: 'within-max-age' });
  });
});
