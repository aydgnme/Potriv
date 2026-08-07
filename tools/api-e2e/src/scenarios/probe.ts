import type { ApiClient, Actor, RequestOptions, ApiResponse } from '../http/client.js';
import type { CoverageRegistry, ScenarioResult } from '../openapi/registry.js';
import { keyOf } from '../openapi/registry.js';

/**
 * One request, one recorded outcome. Everything the suite asserts goes through
 * here so the registry sees every probe and no result can be produced by hand.
 */
export type Probe = {
  readonly id: string;
  readonly kind: ScenarioResult['kind'];
  /** OpenAPI path template, e.g. `/projects/{projectId}` — not the resolved URL. */
  readonly template: string;
  readonly method: string;
  readonly url: string;
  readonly expect: number | readonly number[];
  readonly actor?: Actor;
  readonly options?: Omit<RequestOptions, 'actor'>;
  /** Extra assertion on a successful response; return an error string to fail. */
  readonly check?: (response: ApiResponse) => string | null;
};

export class Prober {
  constructor(
    private readonly client: ApiClient,
    private readonly registry: CoverageRegistry,
  ) {}

  async run(probe: Probe): Promise<ApiResponse> {
    const response = await this.client.request(probe.method, probe.url, {
      ...probe.options,
      actor: probe.actor,
    });

    const expected = Array.isArray(probe.expect) ? probe.expect : [probe.expect];
    let passed = expected.includes(response.status);
    let message: string | undefined;

    if (!passed) {
      message = `expected ${expected.join(' or ')}, received ${response.status}`;
      // A 5xx during a valid scenario is never acceptable and is called out.
      if (response.status >= 500) message = `SERVER ERROR — ${message}`;
    } else if (probe.check) {
      const problem = probe.check(response);
      if (problem) {
        passed = false;
        message = problem;
      }
    }

    this.registry.record({
      id: probe.id,
      operation: keyOf(probe.method, probe.template),
      kind: probe.kind,
      description: probe.id,
      passed,
      method: probe.method,
      path: probe.template,
      actor: probe.actor?.name ?? 'anonymous',
      expected: expected.join('|'),
      actual: String(response.status),
      elapsedMs: response.elapsedMs,
      requestId: response.requestId,
      requestSummary: response.redacted.request,
      responseSummary: passed ? undefined : response.redacted.response,
      message,
    });
    return response;
  }

  /** A check that is not tied to an OpenAPI operation (CORS, correlation, admin HTML). */
  record(result: Omit<ScenarioResult, 'operation'> & { operation?: string | null }): void {
    this.registry.record({ operation: result.operation ?? null, ...result });
  }
}

export function isUuid(value: unknown): boolean {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
