/**
 * Whether `dependency-check-suppressions.xml` still follows the rules its
 * own file header documents, checked independently of anyone remembering to
 * follow them by hand: every `<suppress>` entry must expire (`until`), must
 * target exactly one real CVE (never a wildcard or a whole CVE family), and
 * must be scoped to one specific package at one specific version (never a
 * whole vendor, group, or package family) via `<packageUrl>` or `<gav>`.
 *
 * This is not a general-purpose XML validator — it is a narrow extractor
 * for exactly the small, self-authored subset of the OWASP Dependency-Check
 * suppression schema this repository actually uses (`<suppress until="…">`
 * blocks containing `<notes>`, `<cve>`/`<vulnerabilityName>`, and
 * `<packageUrl>`/`<gav>`). It exists so a suppression that quietly loses its
 * expiry, or is loosened into matching more than the one finding it was
 * reviewed for, fails a fast, deterministic check instead of only being
 * caught by someone re-reading the file during review.
 */

export type SuppressionIssueReason =
  | 'missing-until'
  | 'invalid-until'
  | 'missing-identifier'
  | 'wildcard-identifier'
  | 'multiple-identifiers'
  | 'missing-scope'
  | 'wildcard-scope'
  | 'unpinned-version'
  | 'missing-notes'
  | 'missing-owner'
  | 'missing-review-date';

export type SuppressionIssue = {
  /** 1-based position of the `<suppress>` block in the file, for a human to find it. */
  readonly index: number;
  readonly reason: SuppressionIssueReason;
  readonly detail: string;
};

export type SuppressionPolicyResult =
  | { readonly ok: true; readonly suppressionCount: number }
  | { readonly ok: false; readonly issues: readonly SuppressionIssue[] };

const SUPPRESS_BLOCK = /<suppress\b([^>]*)>([\s\S]*?)<\/suppress>/g;
const UNTIL_ATTR = /\buntil\s*=\s*"([^"]*)"/;
const CVE_ELEMENT = /<cve>([^<]*)<\/cve>/g;
const VULN_NAME_ELEMENT = /<vulnerabilityName(\s[^>]*)?>([^<]*)<\/vulnerabilityName>/g;
const PACKAGE_URL_ELEMENT = /<packageUrl(\s[^>]*)?>([^<]*)<\/packageUrl>/;
const GAV_ELEMENT = /<gav(\s[^>]*)?>([^<]*)<\/gav>/;
const NOTES_ELEMENT = /<notes>([\s\S]*?)<\/notes>/;
const CVE_SHAPE = /^CVE-\d{4}-\d+$/;
/** "Reviewed by <someone>" — the owner attribution this repo's suppressions always carry. */
const REVIEWED_BY_PATTERN = /reviewed\s+by\s+\S/i;
/** A yyyy-MM-dd date anywhere in the notes — the review date. */
const REVIEW_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;
/** An unescaped `*` — repetition/wildcard in a regex matcher, not an escaped literal. */
const UNESCAPED_STAR = /(?<!\\)\*/;

function isValidUntilDate(value: string): boolean {
  if (value.trim().length === 0) return false;
  // Dependency-Check accepts yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss.SSSZ.
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(value.trim())) return false;
  return !Number.isNaN(new Date(value.trim()).getTime());
}

/**
 * The version token immediately after a matcher's version separator,
 * stopping at the first regex metacharacter that would open it back up
 * (`(`, `?`, `$`, `[`, `|`, `+`, or an unescaped `*`). Empty means the
 * matcher goes wide-open right after the separator (e.g. `@.*`) — nothing
 * pins a version at all.
 */
function versionToken(afterSeparator: string): string {
  const stop = afterSeparator.search(/[(?$[|+]|(?<!\\)\*/);
  return stop === -1 ? afterSeparator : afterSeparator.slice(0, stop);
}

function checkVersionPinned(
  matcher: string,
  separator: '@' | ':',
  kind: string,
  index: number,
  issues: SuppressionIssue[],
): void {
  const separatorIndex = matcher.lastIndexOf(separator);
  if (separatorIndex === -1) {
    issues.push({
      index,
      reason: 'unpinned-version',
      detail:
        `The ${kind} matcher ("${matcher}") does not pin a version at all `
        + `(no "${separator}version" separator found).`,
    });
    return;
  }

  const beforeSeparator = matcher.slice(0, separatorIndex);
  if (UNESCAPED_STAR.test(beforeSeparator)) {
    issues.push({
      index,
      reason: 'wildcard-scope',
      detail:
        `The ${kind} matcher's package portion ("${beforeSeparator}") contains an unescaped `
        + 'wildcard — this would match more than the one package it was reviewed for (a whole '
        + 'vendor or package family, not one artifact).',
    });
    return;
  }

  const version = versionToken(matcher.slice(separatorIndex + 1));
  if (version.length === 0 || !/\d/.test(version)) {
    issues.push({
      index,
      reason: 'unpinned-version',
      detail:
        `The ${kind} matcher ("${matcher}") does not pin a specific version — it would keep `
        + 'matching after the dependency is upgraded past the version this suppression was '
        + 'actually reviewed against.',
    });
  }
}

function checkScopeMatcher(
  inner: string,
  index: number,
  issues: SuppressionIssue[],
): void {
  const packageUrlMatch = PACKAGE_URL_ELEMENT.exec(inner);
  if (packageUrlMatch) {
    const matcher = (packageUrlMatch[2] ?? '').trim();
    if (matcher.length === 0) {
      issues.push({
        index,
        reason: 'missing-scope',
        detail: 'The <packageUrl> matcher is empty.',
      });
      return;
    }
    // purl shape: pkg:maven/group/artifact@version — '@' separates the
    // package coordinate from the version.
    checkVersionPinned(matcher, '@', 'packageUrl', index, issues);
    return;
  }

  const gavMatch = GAV_ELEMENT.exec(inner);
  if (gavMatch) {
    const matcher = (gavMatch[2] ?? '').trim();
    if (matcher.length === 0) {
      issues.push({ index, reason: 'missing-scope', detail: 'The <gav> matcher is empty.' });
      return;
    }
    // gav shape: group:artifact:version — the LAST ':' separates the
    // package coordinate from the version (group/artifact ids can contain
    // '.' but not ':').
    checkVersionPinned(matcher, ':', 'gav', index, issues);
    return;
  }

  issues.push({
    index,
    reason: 'missing-scope',
    detail:
      'No <packageUrl> or <gav> matcher — a suppression must be scoped to one specific '
      + 'package, not left to match by CPE, vendor, or CVE alone.',
  });
}

function checkIdentifier(inner: string, index: number, issues: SuppressionIssue[]): void {
  const identifiers: string[] = [];
  let anyRegexFlagged = false;

  for (const match of inner.matchAll(CVE_ELEMENT)) {
    identifiers.push((match[1] ?? '').trim());
  }
  for (const match of inner.matchAll(VULN_NAME_ELEMENT)) {
    identifiers.push((match[2] ?? '').trim());
    if (/\bregex\s*=\s*"true"/.test(match[1] ?? '')) anyRegexFlagged = true;
  }

  if (identifiers.length === 0) {
    issues.push({
      index,
      reason: 'missing-identifier',
      detail: 'No <cve> or <vulnerabilityName> element — a suppression must name exactly one CVE.',
    });
    return;
  }

  // A regex-flagged <vulnerabilityName> is, by construction, a pattern that
  // can match more than the one CVE it appears to name — checked ahead of
  // the count, since this is "wildcard," not "batch of exact identifiers."
  if (anyRegexFlagged) {
    issues.push({
      index,
      reason: 'wildcard-identifier',
      detail:
        'A <vulnerabilityName regex="true"> matcher can match more than one CVE — a suppression '
        + 'must name one exact, literal CVE id.',
    });
    return;
  }

  if (identifiers.length > 1) {
    issues.push({
      index,
      reason: 'multiple-identifiers',
      detail:
        `${identifiers.length} identifiers in one <suppress> block — each suppression must `
        + 'cover exactly one CVE, reviewed and justified on its own, not a batch.',
    });
    return;
  }

  const identifier = identifiers[0] ?? '';
  if (!CVE_SHAPE.test(identifier)) {
    issues.push({
      index,
      reason: 'wildcard-identifier',
      detail:
        `"${identifier}" is not a literal CVE id (expected CVE-YYYY-NNNN...) — a suppression `
        + 'must name one exact CVE, never a pattern or CVE family.',
    });
  }
}

/**
 * `<notes>` is free text by the underlying schema — nothing about the XML
 * shape forces it to actually say who reviewed a suppression or when. This
 * checks for the two structural signals this repository's own convention
 * always carries: a "Reviewed by <name>" attribution (the owner) and a
 * yyyy-MM-dd date (the review date) somewhere in the text. It cannot verify
 * the *content* of the applicability explanation is actually correct —
 * that still needs a human reviewer — but an empty, missing, or
 * owner/date-free `<notes>` block is a structural failure this check can
 * and does catch on its own.
 */
function checkNotes(inner: string, index: number, issues: SuppressionIssue[]): void {
  const notesMatch = NOTES_ELEMENT.exec(inner);
  const notes = (notesMatch?.[1] ?? '').trim();

  if (notes.length === 0) {
    issues.push({
      index,
      reason: 'missing-notes',
      detail:
        'No <notes> element, or it is empty — a suppression must explain why the finding does '
        + 'not apply, who reviewed it, and when.',
    });
    return;
  }

  if (!REVIEWED_BY_PATTERN.test(notes)) {
    issues.push({
      index,
      reason: 'missing-owner',
      detail: '<notes> does not contain a "Reviewed by <owner>" attribution.',
    });
  }

  if (!REVIEW_DATE_PATTERN.test(notes)) {
    issues.push({
      index,
      reason: 'missing-review-date',
      detail: '<notes> does not contain a yyyy-MM-dd review date.',
    });
  }
}

/**
 * Strips XML comments. Exported (not just an inline step of
 * {@link checkSuppressionPolicy}) so anything else reading this file's real
 * content — including this package's own tests, asserting facts directly
 * about the committed suppressions.xml — sees the same "real entries only"
 * view the policy check itself uses, rather than also matching the literal
 * documentation example this file's own header comment contains.
 */
export function stripXmlComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

export function checkSuppressionPolicy(xml: string): SuppressionPolicyResult {
  const issues: SuppressionIssue[] = [];
  let index = 0;

  // This file's own header documents the required shape with a literal
  // example <suppress> block inside an XML comment ("do not uncomment
  // without a real, reviewed finding"). Stripped first so that example is
  // never mistaken for a real entry — it deliberately doesn't look like a
  // real reviewed suppression (CVE-2026-XXXXX) and would otherwise fail
  // this very check on a file that has nothing wrong with it.
  const withoutComments = stripXmlComments(xml);

  for (const block of withoutComments.matchAll(SUPPRESS_BLOCK)) {
    index += 1;
    const [, attrs, inner] = block;

    const untilMatch = UNTIL_ATTR.exec(attrs ?? '');
    if (!untilMatch) {
      issues.push({
        index,
        reason: 'missing-until',
        detail: 'No until="…" attribute — this suppression would never expire on its own.',
      });
    } else if (!isValidUntilDate(untilMatch[1] ?? '')) {
      issues.push({
        index,
        reason: 'invalid-until',
        detail: `until="${untilMatch[1]}" does not parse as a yyyy-MM-dd (or ISO datetime) date.`,
      });
    }

    checkIdentifier(inner ?? '', index, issues);
    checkScopeMatcher(inner ?? '', index, issues);
    checkNotes(inner ?? '', index, issues);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, suppressionCount: index };
}
