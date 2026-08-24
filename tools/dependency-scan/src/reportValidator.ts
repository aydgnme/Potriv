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
 */

export type ReportRejectionReason =
  | 'missing'
  | 'malformed'
  | 'empty'
  | 'invalid-threshold'
  | 'unscored-findings'
  | 'critical-findings';

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
      const v3 = vulnerability.cvssv3?.baseScore;
      const v2 = vulnerability.cvssv2?.score;
      const score = typeof v3 === 'number' ? v3 : typeof v2 === 'number' ? v2 : undefined;

      if (score === undefined) {
        // A vulnerability entry that exists but carries no parseable score
        // is not evidence of safety — it is evidence the report could not
        // be fully checked. Treated as a fail-closed finding of its own
        // rather than silently skipped as "not a match."
        unscored.push(
          `${vulnerability.name ?? 'unknown-cve'} in `
            + `${dependency.fileName ?? 'unknown-dependency'} has no parseable CVSS v2 or v3 score`,
        );
        continue;
      }

      if (score >= maxCvss) {
        findings.push(
          `${vulnerability.name ?? 'unknown-cve'} (score ${score}) in `
            + `${dependency.fileName ?? 'unknown-dependency'}`,
        );
      }
    }
  }

  if (findings.length > 0) {
    return {
      ok: false,
      reason: 'critical-findings',
      detail: `${findings.length} finding(s) at or above CVSS ${maxCvss}.`,
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
