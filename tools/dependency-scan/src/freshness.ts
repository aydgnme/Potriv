import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Whether the cached NVD data this run is about to trust for its scan is
 * still meaningfully fresh, rather than a scan that quietly keeps passing
 * against data that stopped updating weeks ago.
 *
 * The signal is a small metadata file living inside the cached NVD data
 * directory (`~/.m2/repository/org/owasp/dependency-check-data`), written
 * only once every check in this scan (preflight, the scan itself, and the
 * post-scan report validation) has genuinely succeeded. It is therefore not
 * a record of "a workflow run happened" — it is a record of "a workflow run
 * completed a real, verified scan" — and its age is exactly the question
 * "how long ago was that last true?"
 *
 * The check applies whenever the NVD data directory actually holds restored
 * data, decided by inspecting the directory itself (see
 * {@link directoryHasNvdData}) — deliberately NOT by trusting
 * `actions/cache`'s own `cache-hit` output. That output is `true` only on an
 * *exact* primary-key match; this workflow's cache key includes
 * `github.run_id`, which is different on every run, so `cache-hit` is
 * always `false` even on a run that legitimately restored last week's data
 * through `restore-keys`. Gating the freshness check on `cache-hit` alone
 * made this check silently never run against restored data — a cache hit
 * via `restore-keys` skipped the very check that exists to catch a stale
 * one. A directory that genuinely has no data yet (a first run, or a run
 * after the underlying dependency-check data format changed) is still not a
 * finding — this run will populate the record. A directory that already
 * holds data — however it got there — with a missing, unparseable, or
 * out-of-date record is the actual failure mode this exists to catch.
 */

export type FreshnessRejectionReason = 'missing' | 'corrupt' | 'stale';

export type FreshnessResult =
  | { readonly ok: true; readonly reason?: 'no-data-present' | 'within-max-age' }
  | { readonly ok: false; readonly reason: FreshnessRejectionReason; readonly detail: string };

export type FreshnessMetadata = { readonly lastVerifiedUtc: string };

export function checkFreshness(
  metadataRaw: string | undefined,
  now: Date,
  maxAgeDays: number,
  dataPresent: boolean,
): FreshnessResult {
  if (!dataPresent) {
    return { ok: true, reason: 'no-data-present' };
  }

  if (metadataRaw === undefined || metadataRaw.trim().length === 0) {
    return {
      ok: false,
      reason: 'missing',
      detail:
        'The NVD data directory already holds data but carries no freshness record. '
        + 'Either the record was never written by a successful run, or it was lost — '
        + 'either way, nothing here proves this data was ever verified recently.',
    };
  }

  let parsed: Partial<FreshnessMetadata>;
  try {
    parsed = JSON.parse(metadataRaw) as Partial<FreshnessMetadata>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'corrupt', detail: `Freshness record is not valid JSON: ${message}` };
  }

  const lastVerifiedUtc = parsed.lastVerifiedUtc;
  if (typeof lastVerifiedUtc !== 'string') {
    return {
      ok: false,
      reason: 'corrupt',
      detail: 'Freshness record has no lastVerifiedUtc string field.',
    };
  }

  const lastVerified = new Date(lastVerifiedUtc);
  if (Number.isNaN(lastVerified.getTime())) {
    return {
      ok: false,
      reason: 'corrupt',
      detail: `Freshness record's lastVerifiedUtc ("${lastVerifiedUtc}") does not parse as a date.`,
    };
  }

  const ageMs = now.getTime() - lastVerified.getTime();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    const ageDays = (ageMs / (24 * 60 * 60 * 1000)).toFixed(1);
    return {
      ok: false,
      reason: 'stale',
      detail:
        `The cached NVD data was last verified ${ageDays} day(s) ago, `
        + `past the ${maxAgeDays}-day limit.`,
    };
  }

  return { ok: true, reason: 'within-max-age' };
}

export function buildFreshnessRecord(now: Date): string {
  const record: FreshnessMetadata = { lastVerifiedUtc: now.toISOString() };
  return JSON.stringify(record, null, 2);
}

/**
 * Whether `dirPath` already holds real NVD data, independent of how it got
 * there (a fresh download this run, or data restored by `actions/cache`
 * through an exact key match OR a `restore-keys` fallback match). A
 * directory that does not exist, is empty, or holds only the freshness
 * metadata file itself is treated as having no data — the ordinary shape of
 * a ever run and not a finding.
 *
 * `excludeFileNames` exists because the freshness metadata file
 * (`nvd-metadata.json`) lives inside this same directory; without excluding
 * it, a directory holding only that one file would (wrongly) look "present"
 * even though the actual NVD dataset was never restored.
 */
export function directoryHasNvdData(
  dirPath: string,
  excludeFileNames: readonly string[],
): boolean {
  if (!existsSync(dirPath)) {
    return false;
  }

  let entries: string[];
  try {
    entries = readdirSync(dirPath, { recursive: true }) as string[];
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (excludeFileNames.includes(basename(entry))) {
      continue;
    }
    const fullPath = join(dirPath, entry);
    try {
      if (statSync(fullPath).isFile()) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}
