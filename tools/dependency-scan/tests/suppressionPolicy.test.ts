import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkSuppressionPolicy, stripXmlComments } from '../src/suppressionPolicy.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REAL_SUPPRESSIONS_FILE = join(REPO_ROOT, 'apps', 'backend', 'dependency-check-suppressions.xml');
const REAL_BACKEND_POM = join(REPO_ROOT, 'apps', 'backend', 'pom.xml');

function wrap(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<suppressions xmlns="https://jeremylong.github.io/DependencyCheck/dependency-suppression.1.3.xsd">
${body}
</suppressions>`;
}

/** A minimal, policy-satisfying <notes> block, for tests that aren't exercising notes content itself. */
const VALID_NOTES = 'Applies to a fixture only. Reviewed by Test Owner, 2026-08-25. Remove after review.';

describe('an empty suppressions file', () => {
  it('is valid with zero suppressions', () => {
    const result = checkSuppressionPolicy(wrap(''));
    expect(result).toEqual({ ok: true, suppressionCount: 0 });
  });
});

describe('until (expiry)', () => {
  it('fails when until is missing entirely', () => {
    const xml = wrap(`
      <suppress>
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });

  it('accepts the full ISO datetime form', () => {
    const xml = wrap(`
      <suppress until="2026-09-30T00:00:00.000Z">
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
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
        <notes>${VALID_NOTES}</notes>
        <gav regex="true">^org\\.example:lib:1\\.2\\.3$</gav>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });

  it('accepts a non-regex, literal packageUrl pinned to an exact version', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>${VALID_NOTES}</notes>
        <packageUrl>pkg:maven/com.example/lib@1.2.3</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    expect(checkSuppressionPolicy(xml)).toEqual({ ok: true, suppressionCount: 1 });
  });
});

/**
 * The <notes> block is free text by the underlying XSD — nothing about the
 * XML shape forces it to actually name an owner or a review date. These
 * prove the structural checks that exist specifically to catch that: a
 * suppression with no applicability explanation, no "Reviewed by <owner>"
 * attribution, or no yyyy-MM-dd review date fails closed rather than being
 * silently accepted because *some* text happened to be present.
 */
describe('the <notes> block (owner, evidence, review date)', () => {
  it('fails when <notes> is missing entirely', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-notes' }));
  });

  it('fails when <notes> is empty', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes></notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-notes' }));
  });

  it('fails when notes explain applicability but never name a reviewer', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>
          This finding does not apply because the vulnerable code path is
          never invoked by this application. Re-review before expiry.
        </notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-owner' }));
  });

  it('fails when notes name a reviewer but carry no date anywhere', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>
          Does not apply to this codebase. Reviewed by Jane Reviewer, who
          approved this suppression after checking the code path.
        </notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
    `);
    const result = checkSuppressionPolicy(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-review-date' }));
  });

  it('accepts notes with an applicability explanation, a "Reviewed by" owner, and a yyyy-MM-dd date', () => {
    const xml = wrap(`
      <suppress until="2026-09-30">
        <notes>
          Does not apply: the vulnerable code path is unreachable here.
          Reviewed by Jane Reviewer, 2026-08-25.
        </notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/lib@1\\.2\\.3$</packageUrl>
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
        <notes>${VALID_NOTES}</notes>
        <packageUrl regex="true">^pkg:maven/com\\.example/good@1\\.0\\.0$</packageUrl>
        <cve>CVE-2026-00001</cve>
      </suppress>
      <suppress>
        <notes>${VALID_NOTES}</notes>
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

/**
 * The real, committed file this repository ships — the strongest possible
 * regression test. If a future edit to the real CVE-2026-66299 entries (or
 * the file's own documentation example) breaks this policy, this is what
 * catches it, not a synthetic fixture that might drift from reality.
 *
 * CVE-2026-66299 needs exactly two independent entries, not one: three
 * consecutive real scans against verified NVD data (runs 32856766452,
 * 32858443908, 32858766800) attributed the same CVE to a DIFFERENT single
 * tomcat-embed-* artifact each time — Dependency-Check's own CPE analyzer is
 * evidently non-deterministic about which of tomcat-embed-core or
 * tomcat-embed-websocket it names on a given run, not that only one is
 * genuinely affected. Suppressing only whichever one a given run happened
 * to report on was tried twice and failed twice; both are now suppressed
 * explicitly and independently.
 */
describe('the real dependency-check-suppressions.xml — the empty-by-upgrade contract', () => {
  const realXml = readFileSync(REAL_SUPPRESSIONS_FILE, 'utf8');
  const backendPom = readFileSync(REAL_BACKEND_POM, 'utf8');
  // The file's comments contain a literal, deliberately-fake documentation
  // example (CVE-2026-XXXXX, until="2026-12-31") showing the required shape,
  // and a history note that quotes the CVE id this file used to suppress.
  // Assertions below match against the comment-stripped text -- the same view
  // checkSuppressionPolicy itself uses -- so neither is ever mistaken for a
  // real suppression.
  const realEntriesOnly = stripXmlComments(realXml);

  it('passes the policy, and neither the documentation example nor the history note is treated as a real entry', () => {
    expect(checkSuppressionPolicy(realXml)).toEqual({ ok: true, suppressionCount: 0 });
  });

  it('contains no real <suppress> block at all', () => {
    expect([...realEntriesOnly.matchAll(/<suppress\b/g)]).toHaveLength(0);
    expect([...realEntriesOnly.matchAll(/<cve>([^<]*)<\/cve>/g)]).toHaveLength(0);
  });

  // The CVE-2026-66299 entries this file used to carry (tomcat-embed-core and
  // tomcat-embed-websocket at 10.1.57, expiring 2026-09-30) were removed
  // because apps/backend/pom.xml moved to a Tomcat that fixes it -- 10.1.59,
  // Apache having never published 10.1.58. Those two facts have to move
  // together: dropping the pom back below 10.1.58 without restoring a
  // reviewed suppression would put an unfixed, unsuppressed finding straight
  // back into the scan, which is exactly the drift this asserts against.
  it('is consistent with apps/backend/pom.xml: no suppression, because the pom is on a Tomcat that carries the fix', () => {
    const tomcat = /<tomcat\.version>([^<]+)<\/tomcat\.version>/.exec(backendPom);
    expect(tomcat, 'apps/backend/pom.xml must pin tomcat.version').not.toBeNull();
    const parts = (tomcat?.[1] ?? '').trim().split('.').map(Number);
    expect(parts.slice(0, 2)).toEqual([10, 1]);
    expect(parts[2] ?? -1).toBeGreaterThanOrEqual(58);
    expect(realEntriesOnly).not.toContain('CVE-2026-66299');
  });

  // With no real entries left, the fail-closed checks below add one
  // well-formed, policy-conformant entry to the real document and mutate that,
  // one thing wrong at a time. That keeps the coverage the removed entries
  // used to provide -- the real file, really parsed -- instead of losing it
  // along with them.
  const REPRESENTATIVE_ENTRY = [
    '   <suppress until="2027-01-31">',
    '      <notes>',
    '         CVE-2026-12345: the vulnerable code path is never reached from',
    '         this application. Reviewed by Test Owner, 2026-09-15.',
    '      </notes>',
    '      <packageUrl regex="true">^pkg:maven/com\\.example/example\\-lib@1\\.2\\.3(\\?.*)?$</packageUrl>',
    '      <cve>CVE-2026-12345</cve>',
    '   </suppress>',
  ].join('\n');
  const withEntry = realXml.replace('</suppressions>', `${REPRESENTATIVE_ENTRY}\n</suppressions>`);

  it('accepts a well-formed entry added to the real document, so the mutations below are not vacuous', () => {
    expect(withEntry).not.toEqual(realXml);
    expect(checkSuppressionPolicy(withEntry)).toEqual({ ok: true, suppressionCount: 1 });
  });

  it('broadening the package expression to match any version fails the policy check', () => {
    const broadened = withEntry.replace('example\\-lib@1\\.2\\.3(\\?.*)?$', 'example\\-lib@.*$');
    expect(broadened).not.toEqual(withEntry);
    const result = checkSuppressionPolicy(broadened);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'unpinned-version' }));
    }
  });

  it('broadening the package expression to match a whole package family fails the policy check', () => {
    const broadened = withEntry.replace('com\\.example/example\\-lib@1\\.2\\.3', 'com\\.example/.*@1\\.2\\.3');
    expect(broadened).not.toEqual(withEntry);
    const result = checkSuppressionPolicy(broadened);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'wildcard-scope' }));
    }
  });

  it('stripping the owner attribution fails closed', () => {
    const withoutOwner = withEntry.replace('Reviewed by Test Owner', 'Noted by Test Owner');
    expect(withoutOwner).not.toEqual(withEntry);
    const result = checkSuppressionPolicy(withoutOwner);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-owner' }));
    }
  });

  it('stripping the until= expiry fails closed', () => {
    const withoutExpiry = withEntry.replace('<suppress until="2027-01-31">', '<suppress>');
    expect(withoutExpiry).not.toEqual(withEntry);
    const result = checkSuppressionPolicy(withoutExpiry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-until' }));
    }
  });

  it('stripping the CVE identifier fails closed', () => {
    const withoutCve = withEntry.replace('<cve>CVE-2026-12345</cve>', '');
    expect(withoutCve).not.toEqual(withEntry);
    const result = checkSuppressionPolicy(withoutCve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-identifier' }));
    }
  });
});
