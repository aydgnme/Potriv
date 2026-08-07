import { operationKey, type Operation } from './inventory.js';

/**
 * The coverage gate.
 *
 * Every OpenAPI operation must resolve to exactly one outcome. Skipping is not a
 * runtime decision — an operation is either exercised by a registered scenario
 * or it carries an explicit, reasoned exclusion in this file, in source control,
 * where it can be reviewed.
 */

export type OperationStatus = 'PASS' | 'FAIL' | 'INTENTIONALLY_EXCLUDED' | 'BLOCKED';

export type ExclusionReason = {
  readonly key: string;
  readonly reason: string;
  readonly evidence: string;
};

/**
 * Operations deliberately not exercised. Each needs a reason a reviewer can
 * disagree with. An empty list is the goal; entries here are debts, not wins.
 */
export const INTENTIONAL_EXCLUSIONS: readonly ExclusionReason[] = [];

export type ScenarioResult = {
  readonly id: string;
  readonly operation: string | null;
  readonly kind: 'success' | 'anonymous' | 'role' | 'isolation' | 'validation'
    | 'notfound' | 'pagination' | 'contract' | 'operations' | 'admin' | 'mail';
  readonly description: string;
  readonly passed: boolean;
  readonly method?: string;
  readonly path?: string;
  readonly actor?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly elapsedMs?: number;
  readonly requestId?: string | null;
  readonly requestSummary?: string;
  readonly responseSummary?: string;
  readonly message?: string;
};

export class CoverageRegistry {
  private readonly results: ScenarioResult[] = [];
  private readonly operations = new Map<string, Operation>();

  constructor(operations: readonly Operation[]) {
    for (const operation of operations) this.operations.set(operation.key, operation);
  }

  record(result: ScenarioResult): void {
    this.results.push(result);
  }

  get all(): readonly ScenarioResult[] {
    return this.results;
  }

  get failures(): readonly ScenarioResult[] {
    return this.results.filter((r) => !r.passed);
  }

  private resultsFor(key: string): ScenarioResult[] {
    return this.results.filter((r) => r.operation === key);
  }

  statusOf(key: string): OperationStatus {
    if (INTENTIONAL_EXCLUSIONS.some((e) => e.key === key)) return 'INTENTIONALLY_EXCLUDED';
    const results = this.resultsFor(key);
    if (results.length === 0) return 'BLOCKED';
    return results.every((r) => r.passed) ? 'PASS' : 'FAIL';
  }

  /** True when at least one *success-path* probe ran for this operation. */
  hasSuccessProbe(key: string): boolean {
    return this.resultsFor(key).some((r) => r.kind === 'success');
  }

  /**
   * Drift detection. Anything here means the registry and the running backend
   * have diverged and a human must look.
   */
  drift(): { untested: string[]; unknownOperations: string[]; staleExclusions: string[] } {
    const untested: string[] = [];
    for (const key of this.operations.keys()) {
      if (this.statusOf(key) === 'BLOCKED') untested.push(key);
    }
    const unknownOperations = [...new Set(
      this.results
        .map((r) => r.operation)
        .filter((key): key is string => Boolean(key) && !this.operations.has(key!)),
    )];
    const staleExclusions = INTENTIONAL_EXCLUSIONS
      .filter((e) => !this.operations.has(e.key))
      .map((e) => e.key);
    return { untested, unknownOperations, staleExclusions };
  }

  summary() {
    const keys = [...this.operations.keys()];
    const byStatus = { PASS: 0, FAIL: 0, INTENTIONALLY_EXCLUDED: 0, BLOCKED: 0 };
    for (const key of keys) byStatus[this.statusOf(key)] += 1;
    const accounted = byStatus.PASS + byStatus.FAIL + byStatus.INTENTIONALLY_EXCLUDED;
    const withSuccess = keys.filter((k) => this.hasSuccessProbe(k)).length;
    return {
      operations: keys.length,
      ...byStatus,
      /** Accounting: every operation reached a decided outcome. */
      accountingPercent: keys.length === 0 ? 0 : round((accounted / keys.length) * 100),
      /** Success-path: an operation actually did its job at least once. */
      successPathPercent: keys.length === 0 ? 0 : round((withSuccess / keys.length) * 100),
      scenarios: this.results.length,
      scenariosPassed: this.results.filter((r) => r.passed).length,
      scenariosFailed: this.failures.length,
    };
  }

  operationRows() {
    return [...this.operations.values()].map((operation) => {
      const results = this.resultsFor(operation.key);
      const kinds = new Set(results.map((r) => r.kind));
      const latency = results.length
        ? Math.max(...results.map((r) => r.elapsedMs ?? 0))
        : null;
      return {
        method: operation.method,
        path: operation.path,
        operationId: operation.operationId,
        tags: operation.tags,
        status: this.statusOf(operation.key),
        success: kinds.has('success'),
        anonymous: kinds.has('anonymous'),
        role: kinds.has('role'),
        validation: kinds.has('validation') || kinds.has('notfound'),
        isolation: kinds.has('isolation'),
        latencyMs: latency,
      };
    }).sort((a, b) => `${a.path}${a.method}`.localeCompare(`${b.path}${b.method}`));
  }
}

export function keyOf(method: string, path: string): string {
  return operationKey(method, path);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
