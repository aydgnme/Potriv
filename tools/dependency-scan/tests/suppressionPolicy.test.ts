import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkSuppressionPolicy } from '../src/suppressionPolicy.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REAL_SUPPRESSIONS_FILE = join(REPO_ROOT, 'apps', 'backend', 'dependency-check-suppressions.xml');

function wrap(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<suppressions xmlns="https://jeremylong.github.io/DependencyCheck/dependency-suppression.1.3.xsd">
${body}
</suppressions>`;
}

describe('an empty suppressions file', () => {
  it('is valid with zero suppressions', () => {
    const result = checkSuppressionPolicy(wrap(''));
    expect(result).toEqual({ ok: true, suppressionCount: 0 });
  });
});

/**
 * The real, committed file this repository ships — the strongest possible
 * regression test. If a future edit to the real CVE-2026-66299 entry (or
 * the file's own documentation example) breaks this policy, this is what
 * catches it, not a synthetic fixture that might drift from reality.
 */
describe('the real dependency-check-suppressions.xml this repository ships', () => {
  it('passes the policy, and the documentation example inside the header comment is not treated as a real entry', () => {
    const xml = readFileSync(REAL_SUPPRESSIONS_FILE, 'utf8');
    const result = checkSuppressionPolicy(xml);
    // Two entries: real scans non-deterministically attributed the same
    // CVE-2026-66299 to either tomcat-embed-core or tomcat-embed-websocket
    // depending on the run, so both are suppressed explicitly rather than
    // one arbitrarily-chosen artifact.
    expect(result).toEqual({ ok: true, suppressionCount: 2 });
  });
});

describe('until (expiry)', () => {
  it('fails when until is missing entirely', () => {
    const xml = wrap(`
      <suppress>
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-until' }));
  });

  it('fails when until is not a real date', () => {
    const xml = wrap(`
      <suppress until="not-a-date">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'invalid-until' }));
  });

  it('accepts a plain yyyy-MM-dd date', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });

  it('accepts the full ISO datetime form', () => {
    const xml = wrap(`
      <suppress until="2026-09-30T00:00:00.000Z">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });
});

describe('the CVE identifier', () => {
  it('fails when there is no <cve> or <vulnerabilityName> at all', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-identifier' }));
  });

  it('fails on more than one CVE in a single suppression', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
        <cve>CVE-2026-00002</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'multiple-identifiers' }));
  });

  it('fails on a regex-flagged vulnerabilityName (can match a whole CVE family)', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <vulnerabilityName regex="true">CVE-2026-.*</vulnerabilityName>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'wildcard-identifier' }));
  });

  it('fails on a literal <cve> that is not shaped like a real CVE id', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-XXXXX</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'wildcard-identifier' }));
  });

  it('accepts a non-regex <vulnerabilityName> with a real CVE id', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <vulnerabilityName>CVE-2026-00001</vulnerabilityName>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });
});

describe('the package scope matcher', () => {
  it('fails when neither packageUrl nor gav is present', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-scope' }));
  });

  it('fails when the matcher has no version at all', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'unpinned-version' }));
  });

  it('fails when the version is a wildcard (the broad, do-not-uncomment shape from the file header)', () => {
    const xml = wrap(`
      <suppress until="2026-12-31">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/vulnerable-lib@.*$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'unpinned-version' }));
  });

  it('fails when the package portion itself is a wildcard (a whole vendor or group, not one artifact)', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl regex="true">^pkg:maven/org\\.apache\\.tomcat\\.embed/.*@10\\.1\\.57$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'wildcard-scope' }));
  });

  it('accepts a gav matcher pinned to an exact version', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <gav regex="true">^org\\.example:lib:1\\.2\\.3$</gav>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });

  it('accepts a non-regex, literal packageUrl pinned to an exact version', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>test</notes>
        <packageUrl>pkg:maven/com.example/lib@1.2.3</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });
});

describe('multiple suppress blocks', () => {
  it('reports only the block that is actually broken, by its position', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>a good one</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/good@1\\.0\\.0$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
      <suppress>
        <notes>missing its expiry</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/bad@2\\.0\\.0$</packageUrl>
        <cve>CVE-2026-00002</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toEqual(expect.objectContaining({ index: 2, reason: 'missing-until' }));
    }
  });
});
