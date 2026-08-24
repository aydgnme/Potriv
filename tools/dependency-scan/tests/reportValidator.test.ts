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
  readonly cvssv3?: number;
  readonly cvssv2?: number;
  readonly noScore?: boolean;
  readonly nonNumericScore?: boolean;
}): string {
  const vulnerability: Record<string, unknown> = { name: 'CVE-2099-MATRIX' };
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
      expect(result.reason).toBe('critical-findings');
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
 * the test convenient.
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
    if (!expectedOk && !result.ok) expect(result.reason).toBe('critical-findings');
  });

  it('a CVSS v2 HIGH score (7.5) fails', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv2: 7.5 }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('critical-findings');
  });

  it('a CVSS v3 HIGH score (7.8) fails', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv3: 7.8 }), MAX_CVSS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('critical-findings');
  });

  it('a CVSS v2 score just under the threshold (6.9) passes', () => {
    const result = validateReportContent(reportWithVulnerability({ cvssv2: 6.9 }), MAX_CVSS);
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

  it('a definite critical finding is still reported even alongside an unscored one', () => {
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
    // The definite, scored critical finding takes priority in the reported reason.
    if (!result.ok) expect(result.reason).toBe('critical-findings');
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
