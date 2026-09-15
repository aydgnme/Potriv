/**
 * The single CVSS threshold this scan's two independent gates must agree on:
 * the Maven goal's own `-DfailBuildOnCVSS` and this package's post-scan
 * `validate-report` re-check. Before this constant existed the two were two
 * separately hard-coded `9`s in two different places (a Maven CLI flag in
 * the workflow YAML, a `--max-cvss` default here) that could silently drift
 * apart — and had: `9` catches only CRITICAL, letting HIGH findings
 * (7.0–8.9) through a gate meant to block them.
 *
 * `.github/workflows/dependency-check.yml` mirrors this same value in its
 * own `DEPENDENCY_SCAN_MAX_CVSS` job-level env var, which both the Maven
 * step and the `validate-report` step read — a YAML `run:` block cannot
 * `import` from this file, so a single shell env var is that workflow's
 * side of the same "one number, one place" contract. Changing the
 * threshold means updating both this constant and that env var together.
 */
export const DEFAULT_MAX_CVSS = 7.0;
