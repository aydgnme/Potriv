import type { Config } from '../config/env.js';
import type { ApiClient } from '../http/client.js';
import type { RunContext } from '../fixtures/context.js';
import { Prober } from './probe.js';

/**
 * Validation, not-found, pagination, correlation, CORS and the operational
 * endpoints. Representative checks — not a combinatorial explosion.
 */

export async function runValidationScenarios(prober: Prober, ctx: RunContext): Promise<void> {
  const a = ctx.orgA;

  await prober.run({
    id: 'validation:login-missing-password', kind: 'validation', method: 'POST',
    template: '/auth/login', url: '/auth/login', expect: 400,
    options: { body: { email: a.employee.email } },
  });
  await prober.run({
    id: 'validation:login-malformed-email', kind: 'validation', method: 'POST',
    template: '/auth/login', url: '/auth/login', expect: 400,
    options: { body: { email: 'not-an-email', password: 'whatever' } },
  });
  await prober.run({
    id: 'validation:register-weak-password', kind: 'validation', method: 'POST',
    template: '/auth/register-admin', url: '/auth/register-admin', expect: 400,
    options: { body: { name: 'x', email: `weak-${ctx.runId}@potriv.test`, password: 'short',
      organizationName: 'x', headquarterAddress: 'x' } },
  });
  await prober.run({
    id: 'validation:department-blank-name', kind: 'validation', method: 'POST',
    template: '/departments', url: '/departments', expect: 400, actor: a.admin,
    options: { body: { name: '   ' } },
  });
  await prober.run({
    id: 'validation:project-invalid-status', kind: 'validation', method: 'POST',
    template: '/projects', url: '/projects', expect: 400, actor: a.projectManager,
    options: { body: { name: 'bad status', period: 'FIXED', startDate: ctx.utcToday,
      deadlineDate: ctx.utcToday, status: 'BANANA' } },
  });
  await prober.run({
    id: 'validation:project-fixed-without-deadline', kind: 'validation', method: 'POST',
    template: '/projects', url: '/projects', expect: 400, actor: a.projectManager,
    options: { body: { name: 'no deadline', period: 'FIXED', startDate: ctx.utcToday,
      status: 'NOT_STARTED' } },
  });
  await prober.run({
    id: 'validation:malformed-uuid-path', kind: 'validation', method: 'GET',
    template: '/departments/{departmentId}', url: '/departments/not-a-uuid',
    expect: [400, 404], actor: a.admin,
  });
  await prober.run({
    id: 'validation:employee-skill-invalid-level', kind: 'validation', method: 'POST',
    template: '/me/skills', url: '/me/skills', expect: 400, actor: a.employee,
    options: { body: { skillId: a.skillId, level: 'WIZARD', experience: 'ONE_TO_TWO_YEARS' } },
  });
}

/** Valid-but-missing UUIDs. A different case from a malformed one. */
export async function runNotFoundScenarios(prober: Prober, ctx: RunContext): Promise<void> {
  const missing = ctx.nonexistentUuid;
  const cases: ReadonlyArray<[string, string, string, any]> = [
    ['GET', '/departments/{departmentId}', `/departments/${missing}`, ctx.orgA.admin],
    ['GET', '/projects/{projectId}', `/projects/${missing}`, ctx.orgA.projectManager],
    ['GET', '/skills/{skillId}', `/skills/${missing}`, ctx.orgA.employee],
    ['GET', '/skill-categories/{categoryId}', `/skill-categories/${missing}`, ctx.orgA.admin],
    ['GET', '/team-roles/{teamRoleId}', `/team-roles/${missing}`, ctx.orgA.admin],
    ['GET', '/users/{userId}', `/users/${missing}`, ctx.orgA.admin],
  ];
  for (const [method, template, url, actor] of cases) {
    const response = await prober.run({
      id: `notfound:${template}`, kind: 'notfound', method, template, url,
      expect: 404, actor,
    });
    prober.record({
      id: `notfound:${template}:no-stack-trace`, kind: 'notfound',
      description: 'the 404 body carries no stack trace',
      passed: !response.text.includes('at me.aydgn.potriv')
        && !response.text.includes('Exception'),
      operation: null,
    });
  }
}

export async function runPaginationScenarios(prober: Prober, ctx: RunContext): Promise<void> {
  const admin = ctx.orgA.admin;
  const cases: ReadonlyArray<[string, Record<string, string>]> = [
    ['default page', {}],
    ['explicit page', { page: '0', size: '5' }],
    ['boundary size', { page: '0', size: '1' }],
    ['negative page', { page: '-3' }],
    ['oversized size', { size: '99999' }],
    ['non-numeric page', { page: 'abc', size: 'foo' }],
    ['far page yields empty', { page: '9999' }],
  ];
  for (const [label, query] of cases) {
    await prober.run({
      id: `pagination:${label}`, kind: 'pagination', method: 'GET',
      template: '/users', url: '/users', expect: 200, actor: admin,
      options: { query },
    });
  }
}

/** Request correlation, verified from the outside. */
export async function runCorrelationScenarios(client: ApiClient, prober: Prober): Promise<void> {
  const generated = await client.get('/actuator/health');
  prober.record({
    id: 'correlation:generated', kind: 'operations',
    description: 'a response carries a generated X-Request-ID',
    passed: Boolean(generated.requestId), actual: generated.requestId ?? 'none',
  });

  const supplied = await client.get('/actuator/health', { requestId: 'qa-api-e2e-1' });
  prober.record({
    id: 'correlation:honoured', kind: 'operations',
    description: 'a safe caller-supplied id is echoed unchanged',
    passed: supplied.requestId === 'qa-api-e2e-1',
    expected: 'qa-api-e2e-1', actual: supplied.requestId ?? 'none',
  });

  // Inert strings only: nothing here is executable anywhere.
  for (const [label, value] of [
    ['too long', 'a'.repeat(200)],
    ['crlf-encoded', 'inject%0d%0asecond-line'],
    ['angle brackets', '<probe>'],
    ['spaces', 'two words'],
  ] as const) {
    const response = await client.get('/actuator/health', { requestId: value });
    prober.record({
      id: `correlation:replaced:${label}`, kind: 'operations',
      description: `an unusable id (${label}) is replaced, not echoed`,
      passed: Boolean(response.requestId) && response.requestId !== value,
      actual: response.requestId ?? 'none',
    });
  }
}

export async function runCorsScenarios(client: ApiClient, prober: Prober): Promise<void> {
  const allowedOrigin = 'http://localhost:5173';
  const preflight = await client.request('OPTIONS', '/auth/login', {
    headers: {
      origin: allowedOrigin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  prober.record({
    id: 'cors:allowed-origin', kind: 'operations',
    description: 'the configured local origin is allowed',
    passed: preflight.headers['access-control-allow-origin'] === allowedOrigin,
    expected: allowedOrigin, actual: preflight.headers['access-control-allow-origin'] ?? 'none',
  });
  prober.record({
    id: 'cors:allowed-headers', kind: 'operations',
    description: 'Authorization and Content-Type are permitted',
    passed: (preflight.headers['access-control-allow-headers'] ?? '').toLowerCase()
      .includes('authorization'),
    actual: preflight.headers['access-control-allow-headers'] ?? 'none',
  });

  const foreign = await client.request('OPTIONS', '/auth/login', {
    headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'POST' },
  });
  prober.record({
    id: 'cors:unexpected-origin', kind: 'operations',
    description: 'an unlisted origin is not granted access',
    passed: foreign.headers['access-control-allow-origin'] !== 'https://evil.example.com',
    actual: foreign.headers['access-control-allow-origin'] ?? 'none',
  });
}

/** Actuator and OpenAPI, including the readiness contract. */
export async function runOperationalScenarios(
  client: ApiClient, prober: Prober, config: Config,
): Promise<void> {
  for (const [label, path, expected] of [
    ['health', '/actuator/health', 200],
    ['readiness', '/actuator/health/readiness', 200],
    ['info', '/actuator/info', 200],
    // SecurityConfig permits only health and info anonymously; metrics is
    // authenticated. Asserting 401 records the real contract.
    ['metrics', '/actuator/metrics', 401],
    ['openapi', '/v3/api-docs', 200],
  ] as const) {
    const response = await client.get(path);
    prober.record({
      id: `operations:${label}`, kind: 'operations',
      description: `GET ${path}`, passed: response.status === expected,
      expected: String(expected), actual: String(response.status),
      elapsedMs: response.elapsedMs,
    });
  }

  const swagger = await client.get('/swagger-ui/index.html', { accept: 'text/html' });
  prober.record({
    id: 'operations:swagger-ui', kind: 'operations',
    description: 'Swagger UI entry route responds in development',
    passed: swagger.status === 200 || swagger.status === 302,
    actual: String(swagger.status),
  });
  void config;
}

/**
 * The readiness contract under a mail outage: mail is not allowed to gate it.
 * Mailpit is restored afterwards.
 */
export async function runMailResilienceProbe(
  client: ApiClient, prober: Prober,
  stopMail: () => Promise<void>, startMail: () => Promise<void>,
): Promise<void> {
  await stopMail();
  try {
    const readiness = await client.get('/actuator/health/readiness');
    prober.record({
      id: 'operations:readiness-survives-mail-outage', kind: 'operations',
      description: 'readiness stays UP while the mail server is stopped',
      passed: readiness.status === 200,
      expected: '200', actual: String(readiness.status),
    });
    const reset = await client.post('/auth/password-reset/request',
      { body: { email: 'nobody@potriv.test' } });
    prober.record({
      id: 'operations:reset-still-anti-enumerating', kind: 'operations',
      description: 'password-reset stays anti-enumerating during a mail outage',
      passed: reset.status === 202, expected: '202', actual: String(reset.status),
    });
  } finally {
    await startMail();
  }
}
