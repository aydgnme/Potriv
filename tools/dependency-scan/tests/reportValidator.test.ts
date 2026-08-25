import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_CVSS } from '../src/config.js';
import { validateReportContent } from '../src/reportValidator.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
// The real threshold this scan enforces in production (see src/config.ts and
// the workflow's DEPENDENCY_SCAN_MAX_CVSS env var) — using anything else here
// would let this suite drift from what actually runs in CI.
const MAX_CVSS = DEFAULT_MAX_CVSS;

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function reportWithVulnerability(overrides: {
  readonly cvssv4?: number;
  readonly cvssv3?: number;
  readonly cvssv2?: number;
  readonly noScore?: boolean;
  readonly nonNumericScore?: boolean;
}): string {
  const vulnerability: Record<string, unknown> = { name: 'CVE-2099-MATRIX' };
  if (overrides.cvssv4 !== undefined) vulnerability.cvssv4 = { baseScore: overrides.cvssv4 };
  if (overrides.cvssv3 !== undefined) vulnerability.cvssv3 = { baseScore: overrides.cvssv3 };
  if (overrides.cvssv2 !== undefined) vulnerability.cvssv2 = { score: overrides.cvssv2 };
  if (overrides.nonNumericScore) vulnerability.cvssv3 = { baseScore: 'critical' };
  return JSON.stringify({
    dependencies: [
      { fileName: 'matrix-fixture-dependency-1.0.0.jar', vulnerabilities: [vulnerability] },
    ],
  });
}

describe('missing or empty report', () => {
  it('rejects an absent report', () => {
    const result = validateReportContent(undefined, MAX_CVSS);
    expect(result).toEqual({ ok: false, reason: 'missing', detail: expect.any(String) });
  });

  it('rejects a blank file', () => {
    const result = validateReportContent('   \n', MAX_CVSS);
    expect(result).toEqual({ ok: false, reason: 'missing', detail: expect.any(String) });
  });

  it('rejects malformed JSON', () => {
    const result = validateReportContent('{ this is not json', MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects a well-formed report with zero scanned dependencies', () => {
    const result = validateReportContent(JSON.stringify({ dependencies: [] }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('rejects a report missing the dependencies field entirely', () => {
    const result = validateReportContent(JSON.stringify({ reportSchema: '1.1' }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });
});

describe('a real-shaped report', () => {
  it('accepts a report with no finding at or above the threshold', () => {
    const result = validateReportContent(fixture('safe-report.json'), MAX_CVSS);
    expect(result).toEqual({ ok: true, dependencyCount: 2 });
  });

  /**
   * The deterministic fixture the audit asked for: a synthetic, clearly-fake
   * CVE at CVSS 9.8 (and a second at CVSS v2 9.2, proving both score fields
   * are checked), proving the report is rejected — without needing a real
   * NVD sync or a real vulnerable dependency in this repository's own
   * pom.xml.
   */
  it('rejects a report with a critical (CVSS v3) finding at or above the threshold', () => {
    const result = validateReportContent(fixture('critical-cve-report.json'), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('threshold-exceeded');
      expect(result.findings).toEqual([
        expect.stringContaining('CVE-2099-00002'),
        expect.stringContaining('CVE-2099-00003'),
      ]);
    }
  });

  it('is independent of the CVSS threshold configured for the Maven goal', () => {
    // The same fixture, checked against the maximum legal threshold (10),
    // must still pass — proving this is a real comparison against the
    // configured value, not a hard-coded rejection.
    const result = validateReportContent(fixture('critical-cve-report.json'), 10);
    expect(result).toEqual({ ok: true, dependencyCount: 2 });
  });
});

/**
 * ISSUE-002: the threshold moved from 9.0 (CRITICAL only) to 7.0 (HIGH and
 * above), because a 9.0 threshold let real HIGH-severity findings
 * (CVSS 7.0-8.9) through a gate meant to block them. Every point below is
 * checked against the actual production default, not a value chosen to make
 * the test convenient. The rejection reason is `threshold-exceeded`, not
 * `critical-findings` — this gate fires at HIGH severity too, and the
 * threshold itself is a configurable value, not a fixed CRITICAL-only cut.
 */
describe(`CVSS threshold matrix at the production default (${DEFAULT_MAX_CVSS})`, () => {
  it.each([
    [6.9, true],
    [7.0, false],
    [8.9, false],
    [9.0, false],
    [9.8, false],
  ])('a CVSS v3 score of %s is accepted=%s', (score, expectedOk) => {
    const result = validateReportContent(reportWithVulnerability({ cvssv3: score }), MAX_CVSS);
    expect(result.ok).toBe(expectedOk);
    if (!expectedOk && !result.ok) expect(result.reason).toBe('threshold-exceeded');
  });

  it('a CVSS v2 HIGH score (7.5) fails', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv2: 7.5 }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('threshold-exceeded');
  });

  it('a CVSS v3 HIGH score (7.8) fails', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv3: 7.8 }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('threshold-exceeded');
  });

  it('a CVSS v2 score just under the threshold (6.9) passes', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv2: 6.9 }), MAX_CVSS);
    expect(result.ok).toBe(true);
  });
});

/**
 * ISSUE — the validator previously modeled only cvssv3/cvssv2 and had no
 * concept of generation precedence. Real NVD data proved this matters: NVD
 * re-scores CVEs under CVSS v4 as that generation matures, and the v4 score
 * is the more accurate current assessment — not a number to be combined
 * with (e.g. maxed against) the older v3/v2 score for the same CVE. Two
 * real findings from this repository's own dependency tree drove the exact
 * shape of these cases: PostgreSQL JDBC (v4 8.2 / v3 5.9 — v4 is the higher,
 * newer number) and log4j-api (v4 6.9 / v3 7.5 — v4 is the LOWER, newer
 * number, and must still win).
 */
describe('CVSS v4 score precedence (v4 > v3 > v2, latest generation authoritative)', () => {
  it('1. a v4-only score >= 7.0 fails', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv4: 8.1 }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('threshold-exceeded');
  });

  it('2. v4 high, v3 medium: fails on v4, not saved by the lower v3 number', () => {
    const result = validateReportContent(
      reportWithVulnerability({ cvssv4: 8.5, cvssv3: 4.0 }),
      MAX_CVSS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('threshold-exceeded');
      expect(result.findings?.[0]).toContain('v4 score 8.5');
    }
  });

  it('3. v4 medium, v3 high: uses v4 and does NOT classify as threshold-exceeding', () => {
    const result = validateReportContent(
      reportWithVulnerability({ cvssv4: 5.0, cvssv3: 8.5 }),
      MAX_CVSS,
    );
    expect(result.ok).toBe(true);
  });

  it('4. no v4, v3 high: falls back to v3 and fails', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv3: 8.0 }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('threshold-exceeded');
      expect(result.findings?.[0]).toContain('v3 score 8');
    }
  });

  it('5a. a v4 baseScore that is present but not a number falls back to v3, then fails closed if that is also unusable', () => {
    const report = JSON.stringify({
      dependencies: [
        {
          fileName: 'malformed-v4-fixture.jar',
          vulnerabilities: [{ name: 'CVE-2099-BADV4', cvssv4: { baseScore: 'high' } }],
        },
      ],
    });
    const result = validateReportContent(report, MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unscored-findings');
  });

  it('5b. missing scores in every generation fails closed as unscored', () => {
    const result = validateReportContent(reportWithVulnerability({ noScore: true }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unscored-findings');
  });

  /**
   * The real PostgreSQL JDBC finding from this repository's dependency
   * tree: CVE-2026-54291 carries CVSS v4 8.2 and v3 5.9. v4 is authoritative
   * and 8.2 >= 7.0, so this must fail regardless of the lower v3 number.
   */
  it('6. PostgreSQL-shaped fixture (v4 8.2 / v3 5.9) fails on the v4 score', () => {
    const result = validateReportContent(
      reportWithVulnerability({ cvssv4: 8.2, cvssv3: 5.9 }),
      MAX_CVSS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('threshold-exceeded');
      expect(result.findings?.[0]).toContain('v4 score 8.2');
    }
  });

  /**
   * The real log4j-api finding: CVE-2026-34479 carries CVSS v4 6.9 and v3
   * 7.5. This is the case that proves the policy is "latest generation
   * authoritative," not "maximum score": v4 (6.9) is lower than v3 (7.5)
   * but must still be the one used, so this specific finding does not by
   * itself cross the 7.0 threshold.
   */
  it('7. log4j-shaped fixture (v4 6.9 / v3 7.5) is treated according to v4, not the higher v3', () => {
    const result = validateReportContent(
      reportWithVulnerability({ cvssv4: 6.9, cvssv3: 7.5 }),
      MAX_CVSS,
    );
    expect(result.ok).toBe(true);
  });
});

describe('a vulnerability whose severity cannot be read', () => {
  it('fails closed rather than silently treating a missing score as safe', () => {
    const result = validateReportContent(reportWithVulnerability({ noScore: true }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unscored-findings');
      expect(result.findings).toEqual([expect.stringContaining('CVE-2099-MATRIX')]);
    }
  });

  it('fails closed when the score field is present but not a number', () => {
    const result = validateReportContent(
      reportWithVulnerability({ nonNumericScore: true }),
      MAX_CVSS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unscored-findings');
  });

  it('a definite threshold-exceeding finding is still reported even alongside an unscored one', () => {
    const report = JSON.stringify({
      dependencies: [
        {
          fileName: 'mixed-fixture-dependency-1.0.0.jar',
          vulnerabilities: [
            { name: 'CVE-2099-CRITICAL', cvssv3: { baseScore: 9.8 } },
            { name: 'CVE-2099-UNSCORED' },
          ],
        },
      ],
    });
    const result = validateReportContent(report, MAX_CVSS);
    expect(result.ok).toBe(false);
    // The definite, scored finding takes priority in the reported reason.
    if (!result.ok) expect(result.reason).toBe('threshold-exceeded');
  });
});

describe('an invalid configured threshold', () => {
  it.each([
    ['NaN', NaN],
    ['zero', 0],
    ['negative', -1],
    ['above the CVSS scale', 10.1],
  ])('fails closed for a threshold that is %s (%s)', (_label, maxCvss) => {
    const result = validateReportContent(fixture('safe-report.json'), maxCvss);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-threshold');
  });

  it('accepts exactly 10 — the maximum real CVSS score — as a valid threshold', () => {
    const result = validateReportContent(fixture('safe-report.json'), 10);
    expect(result.ok).toBe(true);
  });

  it('rejects an invalid threshold before even looking at report content', () => {
    // Not even a well-formed, clean report is trusted against a broken threshold.
    const result = validateReportContent(undefined, NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-threshold');
  });
});
