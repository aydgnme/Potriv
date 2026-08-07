import type { ScenarioResult } from '../openapi/registry.js';

export type Verdict =
  | 'READY — ALL IN-SCOPE ENDPOINTS VERIFIED'
  | 'READY WITH EXPLICIT ACCEPTED GAPS'
  | 'NOT READY — ENDPOINT OR SECURITY FAILURES REMAIN'
  | 'BLOCKED — ENVIRONMENT COULD NOT COMPLETE';

export type OperationRow = {
  method: string; path: string; operationId: string | null; tags: readonly string[];
  status: string; success: boolean; anonymous: boolean; role: boolean;
  validation: boolean; isolation: boolean; latencyMs: number | null;
};

export type Report = {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  gitSha: string | null;
  target: string;
  environment: 'isolated' | 'existing';
  verdict: Verdict;
  coverage: {
    operations: number; PASS: number; FAIL: number;
    INTENTIONALLY_EXCLUDED: number; BLOCKED: number;
    accountingPercent: number; successPathPercent: number;
    scenarios: number; scenariosPassed: number; scenariosFailed: number;
  };
  reconciliation: {
    sourceMappings: number | null;
    openApiOperations: number;
    adminRoutesDiscovered: number;
    adminRoutesExecuted: number;
    notes: readonly string[];
  };
  security: {
    anonymous: { passed: number; failed: number };
    role: { passed: number; failed: number };
    isolation: { passed: number; failed: number };
    validation: { passed: number; failed: number };
  };
  drift: { untested: string[]; unknownOperations: string[]; staleExclusions: string[] };
  openApiProblems: readonly string[];
  operations: readonly OperationRow[];
  scenarios: readonly ScenarioResult[];
  failures: readonly ScenarioResult[];
  performance: {
    requests: number; medianMs: number; p95Ms: number; maxMs: number;
    slowest: ReadonlyArray<{ method: string; path: string; ms: number }>;
  };
  unexpectedServerErrors: number;
  preflight: ReadonlyArray<{ name: string; ok: boolean; detail: string }>;
};

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index]!;
}
