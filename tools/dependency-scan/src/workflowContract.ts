/**
 * Whether a GitHub Actions workflow's steps appear in a required relative
 * order — not a general YAML/workflow validator, just a narrow, targeted
 * extractor for one specific, checkable fact: "step A happens before step
 * B, which happens before step C," by step `name:`.
 *
 * This exists because `dependency-check.yml`'s NVD-update section has a
 * real ordering dependency that is easy to silently break by reordering
 * steps during an edit: seed from the mirror, then force a live delta,
 * then record the freshness metadata, then explicitly save the cache —
 * all of that BEFORE the scan itself runs and BEFORE the CVSS gate can
 * fail. Getting that order wrong doesn't fail loudly; it just quietly
 * reintroduces the exact cold-sync-timeout failure mode this section
 * exists to fix (the job time out mid-scan, and a database that was
 * actually fully updated never got saved because the save step ran after
 * the point of failure instead of before it).
 */

export type WorkflowContractResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const STEP_NAME_LINE = /^\s*-\s*name:\s*(.+?)\s*$/;

/** Step `name:` values from a workflow YAML's `steps:` list, in file order. */
export function extractStepNames(yamlText: string): readonly string[] {
  const names: string[] = [];
  for (const line of yamlText.split('\n')) {
    const match = STEP_NAME_LINE.exec(line);
    if (match) names.push(match[1] ?? '');
  }
  return names;
}

/**
 * Whether every name in `requiredOrder` appears among the workflow's step
 * names, in that relative order (other, unrelated steps may appear
 * interleaved between them — this checks relative order, not adjacency).
 */
export function checkStepOrder(
  yamlText: string,
  requiredOrder: readonly string[],
): WorkflowContractResult {
  const names = extractStepNames(yamlText);
  let searchFrom = 0;
  let previousIndex = -1;
  let previousName = '';

  for (const required of requiredOrder) {
    const index = names.indexOf(required, searchFrom);
    if (index === -1) {
      return {
        ok: false,
        reason: previousIndex === -1
          ? `Step "${required}" was not found in the workflow at all.`
          : `Step "${required}" was not found after "${previousName}" `
            + `(expected somewhere after step index ${previousIndex}).`,
      };
    }
    previousIndex = index;
    previousName = required;
    searchFrom = index + 1;
  }

  return { ok: true };
}
