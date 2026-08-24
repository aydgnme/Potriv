import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateReportContent } from '../src/reportValidator.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MAX_CVSS = 9;

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
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
    // The same fixture, checked against a much higher threshold, must pass —
    // proving this is a real comparison against the configured value, not a
    // hard-coded rejection.
    const result = validateReportContent(fixture('critical-cve-report.json'), 10);
    expect(result).toEqual({ ok: true, dependencyCount: 2 });
  });
});
