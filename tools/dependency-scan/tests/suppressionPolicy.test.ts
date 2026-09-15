import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkSuppressionPolicy, stripXmlComments } from '../src/suppressionPolicy.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REAL_SUPPRESSIONS_FILE = join(REPO_ROOT, 'apps', 'backend', 'dependency-check-suppressions.xml');

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
describe('the real dependency-check-suppressions.xml — the CVE-2026-66299 contract', () => {
  const realXml = readFileSync(REAL_SUPPRESSIONS_FILE, 'utf8');
  // The file's own header comment contains a literal, deliberately-fake
  // documentation example (CVE-2026-XXXXX, until="2026-12-31") explaining
  // the required shape. Real-entry assertions below match against the
  // comment-stripped text -- the same view checkSuppressionPolicy itself
  // uses -- so that example is never counted as a third, real suppression.
  const realEntriesOnly = stripXmlComments(realXml);

  it('passes the policy, and the documentation example inside the header comment is not treated as a real entry', () => {
    const result = checkSuppressionPolicy(realXml);
    expect(result).toEqual({ ok: true, suppressionCount: 2 });
  });

  it('contains exactly two <suppress> blocks naming CVE-2026-66299, and nothing else', () => {
    const cveMatches = [...realEntriesOnly.matchAll(/<cve>([^<]*)<\/cve>/g)].map((m) => m[1]);
    expect(cveMatches).toEqual(['CVE-2026-66299', 'CVE-2026-66299']);
  });

  it('has one suppression scoped to exactly tomcat-embed-core@10.1.57', () => {
    expect(realEntriesOnly).toContain(
      '<packageUrl regex="true">^pkg:maven/org\\.apache\\.tomcat\\.embed/tomcat\\-embed\\-core@10\\.1\\.57(\\?.*)?$</packageUrl>',
    );
  });

  it('has one suppression scoped to exactly tomcat-embed-websocket@10.1.57', () => {
    expect(realEntriesOnly).toContain(
      '<packageUrl regex="true">^pkg:maven/org\\.apache\\.tomcat\\.embed/tomcat\\-embed\\-websocket@10\\.1\\.57(\\?.*)?$</packageUrl>',
    );
  });

  it('does not scope either suppression to tomcat-embed-el, or to any other tomcat-embed artifact', () => {
    // Exactly two packageUrl matchers overall, and neither mentions "el" as
    // the artifact segment -- a regression here would mean a suppression
    // was added for a finding nothing has ever actually reported.
    const packageUrls = [...realEntriesOnly.matchAll(/<packageUrl[^>]*>([^<]*)<\/packageUrl>/g)].map((m) => m[1]);
    expect(packageUrls).toHaveLength(2);
    // The matchers are regex text themselves, so hyphens/dots are
    // backslash-escaped in the file (tomcat\-embed\-core) -- \\? tolerates
    // that escaping without requiring it.
    for (const url of packageUrls) {
      expect(url).toMatch(/tomcat\\?-embed\\?-(core|websocket)@10\\?\.1\\?\.57/);
    }
  });

  it('both suppressions expire on exactly 2026-09-30', () => {
    const untilMatches = [...realEntriesOnly.matchAll(/<suppress until="([^"]*)"/g)].map((m) => m[1]);
    expect(untilMatches).toEqual(['2026-09-30', '2026-09-30']);
  });

  it('both suppressions independently carry an owner, a review date, and the official advisory link', () => {
    const notesBlocks = [...realEntriesOnly.matchAll(/<notes>([\s\S]*?)<\/notes>/g)].map((m) => m[1]);
    expect(notesBlocks).toHaveLength(2);
    for (const notes of notesBlocks) {
      expect(notes).toMatch(/reviewed\s+by\s+\S/i);
      expect(notes).toMatch(/\b2026-08-25\b/);
      expect(notes).toContain('https://tomcat.apache.org/security-10.html');
    }
  });

  it('removing either suppression breaks the exact-two-suppressions regression test', () => {
    // Deletes the second (websocket) <suppress>...</suppress> block by
    // matching the same structural pattern the real checker uses, proving
    // the exact-count assertion above is not vacuous -- it really does
    // depend on both entries being present.
    const blocks = [...realEntriesOnly.matchAll(/<suppress\b[^>]*>[\s\S]*?<\/suppress>/g)];
    expect(blocks).toHaveLength(2);
    const withOneRemoved = realXml.replace(blocks[1]![0], '');
    const result = checkSuppressionPolicy(withOneRemoved);
    expect(result).not.toEqual({ ok: true, suppressionCount: 2 });
    expect(result).toEqual({ ok: true, suppressionCount: 1 });
  });

  it('broadening either package expression to match any version fails the policy check', () => {
    const broadened = realXml.replace(
      'tomcat\\-embed\\-core@10\\.1\\.57(\\?.*)?$',
      'tomcat\\-embed\\-core@.*$',
    );
    expect(broadened).not.toEqual(realXml);
    const result = checkSuppressionPolicy(broadened);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'unpinned-version' }));
    }
  });

  it('broadening either package expression to match the whole tomcat-embed family fails the policy check', () => {
    const broadened = realXml.replace(
      'org\\.apache\\.tomcat\\.embed/tomcat\\-embed\\-websocket@10\\.1\\.57',
      'org\\.apache\\.tomcat\\.embed/.*@10\\.1\\.57',
    );
    expect(broadened).not.toEqual(realXml);
    const result = checkSuppressionPolicy(broadened);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'wildcard-scope' }));
    }
  });

  it('stripping the owner attribution from a real entry fails closed', () => {
    // The real notes text line-wraps ("Reviewed by Mert\n  Aydoğan (...)"),
    // so \s+ between words, not a literal space, is required to match it.
    const withoutOwner = realXml.replace(
      /Reviewed\s+by\s+Mert\s+Aydoğan\s+\(aydgnme\),\s*2026-08-25\.\s*/g,
      '',
    );
    expect(withoutOwner).not.toEqual(realXml);
    const result = checkSuppressionPolicy(withoutOwner);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-owner' }));
    }
  });

  it('stripping the until= expiry from a real entry fails closed', () => {
    const withoutExpiry = realXml.replace('<suppress until="2026-09-30">', '<suppress>');
    expect(withoutExpiry).not.toEqual(realXml);
    const result = checkSuppressionPolicy(withoutExpiry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-until' }));
    }
  });

  it('stripping the CVE identifier from a real entry fails closed', () => {
    const withoutCve = realXml.replace('<cve>CVE-2026-66299</cve>', '');
    expect(withoutCve).not.toEqual(realXml);
    const result = checkSuppressionPolicy(withoutCve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ reason: 'missing-identifier' }));
    }
  });
});
