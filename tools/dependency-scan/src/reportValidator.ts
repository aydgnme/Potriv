/**
 * Whether a `dependency-check-report.json` is a real scan result worth
 * trusting, checked independently of `dependency-check-maven`'s own exit
 * code.
 *
 * The Maven goal already asks to fail on its own when it finds something at
 * or above the configured threshold. This module does not replace that
 * gate — it is the second one: even if the Maven goal somehow exited 0 (a
 * plugin bug, a changed default, an environment quirk this repository does
 * not control), nothing here trusts that alone. The report itself is parsed
 * and re-checked for the same threshold, plus the failure modes an exit code
 * cannot distinguish: no report at all, an empty one, one that is not valid
 * JSON, or one that lists a vulnerability whose severity could not even be
 * read.
 *
 * Score selection follows CVSS generation precedence, latest first: v4 when
 * present and valid, else v3, else v2, else the finding fails closed as
 * unscored. This is deliberately NOT "the maximum across all generations" —
 * NVD re-scores a CVE under a newer generation because the newer generation
 * is considered the more accurate assessment, so a v4 score supersedes an
 * older v3/v2 score for that same CVE rather than being combined with it.
 * A real case this matters for: CVE-2026-34479 (log4j-api) carries v4 6.9
 * and v3 7.5 — under a "use the latest generation" policy this is 6.9 (not
 * threshold-exceeding at 7.0); under a "use the max" policy it would wrongly
 * stay flagged on the older, superseded number.
 */

export type ReportRejectionReason =
  | 'missing'
  | 'malformed'
  | 'empty'
  | 'invalid-threshold'
  | 'unscored-findings'
  | 'threshold-exceeded';

export type ReportValidation =
  | { readonly ok: true; readonly dependencyCount: number }
  | {
      readonly ok: false;
      readonly reason: ReportRejectionReason;
      readonly detail: string;
      readonly findings?: readonly string[];
    };

type DependencyCheckVulnerability = {
  readonly name?: string;
  readonly cvssv4?: { readonly baseScore?: number };
  readonly cvssv3?: { readonly baseScore?: number };
  readonly cvssv2?: { readonly score?: number };
};

type DependencyCheckDependency = {
  readonly fileName?: string;
  readonly vulnerabilities?: readonly DependencyCheckVulnerability[];
};

type DependencyCheckReport = {
  readonly dependencies?: readonly DependencyCheckDependency[];
};

/** CVSS has no score above 10 — a configured value outside (0, 10] cannot be a real threshold. */
const MAX_POSSIBLE_CVSS = 10;

type ScoreGeneration = 'v4' | 'v3' | 'v2';

/**
 * The authoritative score for one vulnerability entry: the newest CVSS
 * generation that carries a valid (finite, 0-10) number, ignoring any older
 * generation's score once a newer one is present — even if the newer one is
 * lower. `undefined` means no generation on this entry parses as a usable
 * score at all.
 */
function selectAuthoritativeScore(
  vulnerability: DependencyCheckVulnerability,
): { readonly score: number; readonly generation: ScoreGeneration } | undefined {
  const candidates: ReadonlyArray<{ readonly score: unknown; readonly generation: ScoreGeneration }> = [
    { score: vulnerability.cvssv4?.baseScore, generation: 'v4' },
    { score: vulnerability.cvssv3?.baseScore, generation: 'v3' },
    { score: vulnerability.cvssv2?.score, generation: 'v2' },
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate.score === 'number'
      && Number.isFinite(candidate.score)
      && candidate.score >= 0
      && candidate.score <= MAX_POSSIBLE_CVSS
    ) {
      return { score: candidate.score, generation: candidate.generation };
    }
  }
  return undefined;
}

export function validateReportContent(
  rawContent: string | undefined,
  maxCvss: number,
): ReportValidation {
  if (!Number.isFinite(maxCvss) || maxCvss <= 0 || maxCvss > MAX_POSSIBLE_CVSS) {
    return {
      ok: false,
      reason: 'invalid-threshold',
      detail:
        `The configured CVSS threshold (${JSON.stringify(maxCvss)}) is not a usable value — `
        + `it must be a finite number greater than 0 and at most ${MAX_POSSIBLE_CVSS}. `
        + 'Refusing to validate a report against a broken threshold rather than silently '
        + 'skipping the check or falling back to a default.',
    };
  }

  if (rawContent === undefined || rawContent.trim().length === 0) {
    return {
      ok: false,
      reason: 'missing',
      detail: 'Expected a dependency-check-report.json file to exist and be non-empty.',
    };
  }

  let parsed: DependencyCheckReport;
  try {
    parsed = JSON.parse(rawContent) as DependencyCheckReport;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'malformed', detail: `Report is not valid JSON: ${message}` };
  }

  const dependencies = parsed.dependencies ?? [];
  if (dependencies.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      detail:
        'Report parses but lists zero scanned dependencies, which for this project\'s '
        + 'dependency tree means the scan did not actually run against real data.',
    };
  }

  const findings: string[] = [];
  const unscored: string[] = [];
  for (const dependency of dependencies) {
    for (const vulnerability of dependency.vulnerabilities ?? []) {
      const selected = selectAuthoritativeScore(vulnerability);

      if (selected === undefined) {
        // A vulnerability entry that exists but carries no parseable score
        // in any CVSS generation is not evidence of safety — it is evidence
        // the report could not be fully checked. Treated as a fail-closed
        // finding of its own rather than silently skipped as "not a match."
        unscored.push(
          `${vulnerability.name ?? 'unknown-cve'} in `
            + `${dependency.fileName ?? 'unknown-dependency'} has no parseable CVSS v4, v3, or v2 score`,
        );
        continue;
      }

      if (selected.score >= maxCvss) {
        findings.push(
          `${vulnerability.name ?? 'unknown-cve'} (${selected.generation} score ${selected.score}) in `
            + `${dependency.fileName ?? 'unknown-dependency'}`,
        );
      }
    }
  }

  if (findings.length > 0) {
    return {
      ok: false,
      reason: 'threshold-exceeded',
      detail: `${findings.length} finding(s) at or above CVSS ${maxCvss} (latest available generation).`,
      findings,
    };
  }

  if (unscored.length > 0) {
    return {
      ok: false,
      reason: 'unscored-findings',
      detail:
        `${unscored.length} vulnerability finding(s) could not be scored against the CVSS `
        + `${maxCvss} threshold, so they cannot be confirmed safe. Treating an unreadable `
        + 'score as a failure rather than as an implicit pass.',
      findings: unscored,
    };
  }

  return { ok: true, dependencyCount: dependencies.length };
}
