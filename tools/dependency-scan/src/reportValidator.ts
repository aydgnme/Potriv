/**
 * Whether a `dependency-check-report.json` is a real scan result worth
 * trusting, checked independently of `dependency-check-maven`'s own exit
 * code.
 *
 * `-DfailBuildOnCVSS=9` already asks the Maven goal to fail on its own when
 * it finds something above the threshold. This module does not replace that
 * gate — it is the second one: even if the Maven goal somehow exited 0 (a
 * plugin bug, a changed default, an environment quirk this repository does
 * not control), nothing here trusts that alone. The report itself is parsed
 * and re-checked for the same threshold, plus the failure modes an exit code
 * cannot distinguish: no report at all, an empty one, or one that is not
 * valid JSON.
 */

export type ReportRejectionReason = 'missing' | 'malformed' | 'empty' | 'critical-findings';

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

export function validateReportContent(
  rawContent: string | undefined,
  maxCvss: number,
): ReportValidation {
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
  for (const dependency of dependencies) {
    for (const vulnerability of dependency.vulnerabilities ?? []) {
      const score = vulnerability.cvssv3?.baseScore ?? vulnerability.cvssv2?.score;
      if (typeof score === 'number' && score >= maxCvss) {
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

  return { ok: true, dependencyCount: dependencies.length };
}
