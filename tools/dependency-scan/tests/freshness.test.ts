import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildFreshnessRecord, checkFreshness, directoryHasNvdData } from '../src/freshness.js';

const NOW = new Date('2026-08-24T12:00:00Z');
const MAX_AGE_DAYS = 10;
const METADATA_FILE_NAME = 'nvd-metadata.json';

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('no data present (a fresh environment, or a changed cache key format)', () => {
  it('is never a failure, even with no metadata at all', () => {
    const result = checkFreshness(undefined, NOW, MAX_AGE_DAYS, false);
    expect(result).toEqual({ ok: true, reason: 'no-data-present' });
  });

  it('is never a failure even if a stale record happens to be present', () => {
    // Belt and suspenders: dataPresent is the authority, not the record's own age.
    const stale = buildFreshnessRecord(new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000));
    const result = checkFreshness(stale, NOW, MAX_AGE_DAYS, false);
    expect(result.ok).toBe(true);
  });
});

describe('data is present', () => {
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

  it('treats the boundary just under the limit as fresh', () => {
    const result = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(MAX_AGE_DAYS - 0.01) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(result.ok).toBe(true);
  });

  it('treats the boundary exactly at the limit as fresh (not yet over)', () => {
    const result = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(MAX_AGE_DAYS) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(result.ok).toBe(true);
  });

  it('treats the boundary just over the limit as stale', () => {
    const result = checkFreshness(
      JSON.stringify({ lastVerifiedUtc: daysAgo(MAX_AGE_DAYS + 0.01) }),
      NOW,
      MAX_AGE_DAYS,
      true,
    );
    expect(result.ok).toBe(false);
  });
});

describe('buildFreshnessRecord', () => {
  it('round-trips through checkFreshness as fresh', () => {
    const record = buildFreshnessRecord(NOW);
    const result = checkFreshness(record, NOW, MAX_AGE_DAYS, true);
    expect(result).toEqual({ ok: true, reason: 'within-max-age' });
  });
});

describe('directoryHasNvdData', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reports no data for a directory that does not exist at all', () => {
    dir = join(tmpdir(), 'nvd-freshness-never-created');
    expect(directoryHasNvdData(dir, [METADATA_FILE_NAME])).toBe(false);
  });

  it('reports no data for an empty directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-empty-'));
    expect(directoryHasNvdData(dir, [METADATA_FILE_NAME])).toBe(false);
  });

  it('reports no data when the directory holds only the freshness metadata file itself', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-metadata-only-'));
    writeFileSync(join(dir, METADATA_FILE_NAME), buildFreshnessRecord(NOW), 'utf8');
    expect(directoryHasNvdData(dir, [METADATA_FILE_NAME])).toBe(false);
  });

  it('reports data present when a real cache file sits alongside the metadata file', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-with-data-'));
    writeFileSync(join(dir, METADATA_FILE_NAME), buildFreshnessRecord(NOW), 'utf8');
    writeFileSync(join(dir, 'odc.mv.db'), 'not a real database, just a fixture', 'utf8');
    expect(directoryHasNvdData(dir, [METADATA_FILE_NAME])).toBe(true);
  });

  it('finds data nested inside a version subdirectory', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-nested-'));
    mkdirSync(join(dir, '12.2.2'), { recursive: true });
    writeFileSync(join(dir, '12.2.2', 'odc.mv.db'), 'nested fixture data', 'utf8');
    expect(directoryHasNvdData(dir, [METADATA_FILE_NAME])).toBe(true);
  });
});

/**
 * Reproduces FINDING/ISSUE-001 exactly: the workflow's cache key is
 * `nvd-${DEPENDENCY_CHECK_VERSION}-${github.run_id}`, which is different on
 * every run, so `actions/cache`'s `cache-hit` output — true only on an
 * *exact* primary-key match — is always `false`, even on a run that
 * legitimately restored last week's data through `restore-keys`. The old
 * design gated the freshness check on that output, so a `restore-keys` hit
 * silently skipped the very check meant to catch stale reused data.
 */
describe('the run_id + restore-keys scenario the real workflow produces', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('models a restore-keys hit: real data restored, but its freshness record is 45 days stale', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-restore-keys-'));
    // What last week's successful run actually left in the cache: real NVD
    // data plus the freshness record that run wrote.
    writeFileSync(join(dir, 'odc.mv.db'), 'restored NVD data from last week', 'utf8');
    const staleRecord = buildFreshnessRecord(new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000));
    writeFileSync(join(dir, METADATA_FILE_NAME), staleRecord, 'utf8');

    // In the real workflow this run's cache key never matches exactly
    // (github.run_id differs every run), so actions/cache's own cache-hit
    // output would be the literal string "false" here — the data only
    // arrived via restore-keys.
    const cacheHitOutputFromRestoreKeys = false;

    // The bug: the OLD implementation trusted that output directly and
    // skipped the check entirely, silently approving 45-day-old data.
    const legacyDecision: { ok: boolean; reason: string } = !cacheHitOutputFromRestoreKeys
      ? { ok: true, reason: 'no-cache-hit' }
      : { ok: false, reason: 'unreachable-in-this-fixture' };
    expect(legacyDecision.ok).toBe(true); // demonstrates the old bug: wrongly permissive

    // The fix: decide from the directory's real contents, not from
    // actions/cache's exact-match-only signal.
    const dataPresent = directoryHasNvdData(dir, [METADATA_FILE_NAME]);
    expect(dataPresent).toBe(true);
    const result = checkFreshness(staleRecord, NOW, MAX_AGE_DAYS, dataPresent);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('stale');
  });

  it('models the same restore-keys hit with a fresh record: still checked, and still passes', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-restore-keys-fresh-'));
    writeFileSync(join(dir, 'odc.mv.db'), 'restored NVD data from three days ago', 'utf8');
    const freshRecord = buildFreshnessRecord(new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000));
    writeFileSync(join(dir, METADATA_FILE_NAME), freshRecord, 'utf8');

    const dataPresent = directoryHasNvdData(dir, [METADATA_FILE_NAME]);
    const result = checkFreshness(freshRecord, NOW, MAX_AGE_DAYS, dataPresent);
    expect(result).toEqual({ ok: true, reason: 'within-max-age' });
  });

  it('an exact cache-hit run is checked exactly the same way as a restore-keys run', () => {
    dir = mkdtempSync(join(tmpdir(), 'nvd-freshness-exact-hit-'));
    writeFileSync(join(dir, 'odc.mv.db'), 'restored NVD data', 'utf8');
    const staleRecord = buildFreshnessRecord(new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000));
    writeFileSync(join(dir, METADATA_FILE_NAME), staleRecord, 'utf8');

    // Whether actions/cache reports an exact hit or not is irrelevant now —
    // only the directory's real contents decide.
    const dataPresent = directoryHasNvdData(dir, [METADATA_FILE_NAME]);
    const result = checkFreshness(staleRecord, NOW, MAX_AGE_DAYS, dataPresent);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('stale');
  });
});
