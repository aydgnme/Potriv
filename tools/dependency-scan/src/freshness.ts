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
 * The check only applies when the cache action reports a hit
 * (`cacheHit === true`): a cache miss is the ordinary, expected shape of the
 * very first run, or of a run after the cache key changed, and a fresh
 * environment having no freshness record yet is not a finding — this run
 * will populate one. A cache *hit* with a missing, unparseable, or
 * out-of-date record is the actual failure mode this exists to catch: the
 * cache is being reused, but nothing about it proves the data inside it was
 * ever verified recently.
 */

export type FreshnessRejectionReason = 'missing' | 'corrupt' | 'stale';

export type FreshnessResult =
  | { readonly ok: true; readonly reason?: 'no-cache-hit' | 'within-max-age' }
  | { readonly ok: false; readonly reason: FreshnessRejectionReason; readonly detail: string };

export type FreshnessMetadata = { readonly lastVerifiedUtc: string };

export function checkFreshness(
  metadataRaw: string | undefined,
  now: Date,
  maxAgeDays: number,
  cacheHit: boolean,
): FreshnessResult {
  if (!cacheHit) {
    return { ok: true, reason: 'no-cache-hit' };
  }

  if (metadataRaw === undefined || metadataRaw.trim().length === 0) {
    return {
      ok: false,
      reason: 'missing',
      detail:
        'The NVD data cache was restored (a cache hit) but carries no freshness record. '
        + 'Either the record was never written by a successful run, or it was lost — '
        + 'either way, nothing here proves this cached data was ever verified recently.',
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
