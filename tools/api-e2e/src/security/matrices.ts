import type { Operation } from '../openapi/inventory.js';
import type { RunContext } from '../fixtures/context.js';
import { Prober } from '../scenarios/probe.js';

/**
 * The three security matrices.
 *
 * 401 and 403 are never treated as interchangeable: one says "we do not know who
 * you are", the other "we know, and no". Conflating them hides real defects.
 */

/** Public by SecurityConfig — audited from source, not assumed. */
export const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  'POST /auth/register-admin',
  'POST /auth/register-employee/{inviteToken}',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/confirm',
]);

/** A minimally valid body per operation, so validation cannot mask a 401. */
function minimalBody(operation: Operation): unknown {
  if (!operation.hasRequestBody) return undefined;
  const path = operation.path;
  if (path.includes('/roles')) return { roles: ['EMPLOYEE'] };
  if (path.includes('/manager')) return { userId: '00000000-0000-4000-8000-000000000000' };
  if (path.includes('/status')) return { status: 'ACTIVE' };
  if (path.includes('team-finder')) return {};
  if (path.includes('deallocation-proposals')) return { reason: 'probe' };
  if (path.includes('assignment-proposals')) {
    return { employeeId: '00000000-0000-4000-8000-000000000000', teamRoleIds: [] };
  }
  if (path === '/skills') return { categoryId: '00000000-0000-4000-8000-000000000000', name: 'x' };
  if (path === '/me/skills') {
    return { skillId: '00000000-0000-4000-8000-000000000000', level: 'KNOWS',
      experience: 'ZERO_TO_SIX_MONTHS' };
  }
  if (path === '/projects') {
    return { name: 'probe', period: 'ONGOING', startDate: '2026-01-01', status: 'NOT_STARTED' };
  }
  if (path === '/auth/logout') return { refreshToken: 'probe' };
  return { name: 'probe' };
}

/** A path where every template parameter is filled with a real-looking UUID. */
function resolve(path: string, ctx: RunContext): string {
  return path
    .replace('{inviteToken}', ctx.orgA.inviteToken)
    .replace(/\{[^}]+\}/g, ctx.nonexistentUuid);
}

/**
 * Every protected operation must refuse an anonymous caller with 401 — with a
 * *valid* body, so a 400 from validation cannot be mistaken for authentication.
 */
export async function runAnonymousMatrix(
  prober: Prober, operations: readonly Operation[], ctx: RunContext,
): Promise<void> {
  for (const operation of operations) {
    if (PUBLIC_OPERATIONS.has(operation.key)) continue;
    await prober.run({
      id: `anon:${operation.key}`, kind: 'anonymous',
      method: operation.method, template: operation.path,
      url: resolve(operation.path, ctx), expect: 401,
      options: { body: minimalBody(operation) },
    });
  }
}

/** Public operations must stay reachable without a token. */
export async function runPublicMatrix(
  prober: Prober, operations: readonly Operation[], ctx: RunContext,
): Promise<void> {
  for (const operation of operations) {
    if (!PUBLIC_OPERATIONS.has(operation.key)) continue;
    await prober.run({
      id: `public:${operation.key}`, kind: 'anonymous',
      method: operation.method, template: operation.path,
      url: resolve(operation.path, ctx),
      // Reachable is the assertion: anything other than 401/403 proves the
      // endpoint is not behind authentication.
      expect: [200, 201, 202, 204, 400, 404, 409, 422],
      options: { body: minimalBody(operation) },
    });
  }
}

type RoleCase = {
  readonly id: string;
  readonly method: string;
  readonly template: string;
  readonly url: (ctx: RunContext) => string;
  readonly forbiddenActor: (ctx: RunContext) => { name: string; role: string; token?: string };
  readonly body?: unknown;
};

/** Authenticated-but-wrong-role must be 403, never 401 and never success. */
const ROLE_CASES: readonly RoleCase[] = [
  { id: 'role:employee-cannot-list-users', method: 'GET', template: '/users',
    url: () => '/users', forbiddenActor: (c) => c.orgA.employee },
  { id: 'role:employee-cannot-create-department', method: 'POST', template: '/departments',
    url: () => '/departments', forbiddenActor: (c) => c.orgA.employee,
    body: { name: 'forbidden probe' } },
  { id: 'role:employee-cannot-create-project', method: 'POST', template: '/projects',
    url: () => '/projects', forbiddenActor: (c) => c.orgA.employee,
    body: { name: 'forbidden probe', period: 'ONGOING', startDate: '2026-01-01',
      status: 'NOT_STARTED' } },
  { id: 'role:employee-cannot-create-team-role', method: 'POST', template: '/team-roles',
    url: () => '/team-roles', forbiddenActor: (c) => c.orgA.employee,
    body: { name: 'forbidden probe' } },
  // Reading the catalogue does not make a project manager its owner.
  { id: 'role:project-manager-cannot-create-team-role', method: 'POST',
    template: '/team-roles', url: () => '/team-roles',
    forbiddenActor: (c) => c.orgA.projectManager, body: { name: 'forbidden probe' } },
  { id: 'role:project-manager-cannot-read-team-role-detail', method: 'GET',
    template: '/team-roles/{teamRoleId}',
    url: (c) => `/team-roles/${c.orgA.teamRoleId}`,
    forbiddenActor: (c) => c.orgA.projectManager },
  { id: 'role:employee-cannot-read-review-queue', method: 'GET',
    template: '/department/project-proposals', url: () => '/department/project-proposals',
    forbiddenActor: (c) => c.orgA.employee },
  { id: 'role:employee-cannot-rotate-invite', method: 'POST',
    template: '/organizations/current/invite/rotate',
    url: () => '/organizations/current/invite/rotate', forbiddenActor: (c) => c.orgA.employee },
  { id: 'role:org-admin-cannot-read-audit-events', method: 'GET',
    template: '/admin/security/audit-events', url: () => '/admin/security/audit-events',
    forbiddenActor: (c) => c.orgA.admin },
  { id: 'role:org-admin-cannot-change-user-status', method: 'PATCH',
    template: '/admin/users/{userId}/status',
    url: (c) => `/admin/users/${c.orgA.employee.userId}/status`,
    forbiddenActor: (c) => c.orgA.admin, body: { status: 'SUSPENDED' } },
  { id: 'role:employee-cannot-run-team-finder', method: 'POST',
    template: '/projects/{projectId}/team-finder',
    url: (c) => `/projects/${c.orgA.projectId}/team-finder`,
    forbiddenActor: (c) => c.orgA.employee, body: {} },
];

export async function runRoleMatrix(prober: Prober, ctx: RunContext): Promise<void> {
  for (const testCase of ROLE_CASES) {
    await prober.run({
      id: testCase.id, kind: 'role', method: testCase.method, template: testCase.template,
      url: testCase.url(ctx), expect: 403, actor: testCase.forbiddenActor(ctx),
      options: { body: testCase.body },
    });
  }
}

/**
 * Cross-organization access. Org B's actor uses Org A's real identifiers.
 *
 * The backend's established contract is anti-enumeration: a resource in another
 * organization resolves to 404, not 403. Anything 2xx here is a data leak and a
 * critical failure.
 */
export async function runIsolationMatrix(prober: Prober, ctx: RunContext): Promise<void> {
  const b = ctx.orgB;
  const a = ctx.orgA;
  const cases: ReadonlyArray<{
    id: string; method: string; template: string; url: string;
    actor: { name: string; role: string; token?: string }; body?: unknown;
  }> = [
    { id: 'isolation:read-foreign-department', method: 'GET',
      template: '/departments/{departmentId}', url: `/departments/${a.departmentId}`,
      actor: b.admin },
    { id: 'isolation:update-foreign-department', method: 'PATCH',
      template: '/departments/{departmentId}', url: `/departments/${a.departmentId}`,
      actor: b.admin, body: { name: 'hijacked' } },
    { id: 'isolation:delete-foreign-department', method: 'DELETE',
      template: '/departments/{departmentId}', url: `/departments/${a.departmentId}`,
      actor: b.admin },
    { id: 'isolation:read-foreign-project', method: 'GET',
      template: '/projects/{projectId}', url: `/projects/${a.projectId}`,
      actor: b.projectManager },
    { id: 'isolation:update-foreign-project', method: 'PATCH',
      template: '/projects/{projectId}', url: `/projects/${a.projectId}`,
      actor: b.projectManager, body: { generalDescription: 'hijacked' } },
    { id: 'isolation:read-foreign-project-details', method: 'GET',
      template: '/projects/{projectId}/details', url: `/projects/${a.projectId}/details`,
      actor: b.projectManager },
    { id: 'isolation:read-foreign-project-team', method: 'GET',
      template: '/projects/{projectId}/team', url: `/projects/${a.projectId}/team`,
      actor: b.projectManager },
    { id: 'isolation:read-foreign-skill', method: 'GET',
      template: '/skills/{skillId}', url: `/skills/${a.skillId}`, actor: b.departmentManager },
    { id: 'isolation:read-foreign-user', method: 'GET',
      template: '/users/{userId}', url: `/users/${a.employee.userId}`, actor: b.admin },
    { id: 'isolation:assign-foreign-manager', method: 'PUT',
      template: '/departments/{departmentId}/manager',
      url: `/departments/${a.departmentId}/manager`, actor: b.admin,
      body: { userId: b.employee.userId } },
    { id: 'isolation:team-finder-on-foreign-project', method: 'POST',
      template: '/projects/{projectId}/team-finder', url: `/projects/${a.projectId}/team-finder`,
      actor: b.projectManager, body: {} },
    { id: 'isolation:propose-onto-foreign-project', method: 'POST',
      template: '/projects/{projectId}/assignment-proposals',
      url: `/projects/${a.projectId}/assignment-proposals`, actor: b.projectManager,
      body: { employeeId: b.employee.userId, workHoursPerDay: 2, teamRoleIds: [b.teamRoleId] } },
  ];

  for (const testCase of cases) {
    await prober.run({
      id: testCase.id, kind: 'isolation', method: testCase.method,
      template: testCase.template, url: testCase.url, actor: testCase.actor,
      // 403 and 404 are both acceptable refusals; the contract is anti-enumeration.
      expect: [403, 404], options: { body: testCase.body },
    });
  }
}
