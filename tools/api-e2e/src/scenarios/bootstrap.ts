import type { ApiClient } from '../http/client.js';
import { DEFAULT_PASSWORD, inviteTokenFrom, login, type RunContext } from '../fixtures/context.js';
import { Prober } from './probe.js';

/**
 * Solo organization setup, over real HTTP against a brand-new organization.
 *
 * A founder is the only member of the organization they just created, so nobody
 * exists who could grant them the roles the setup workflow needs. This proves the
 * narrow exception works — and, just as importantly, that it stays narrow: the
 * ordinary organization built by the fixtures still refuses a self-role rewrite.
 */
export async function runBootstrapScenarios(
  client: ApiClient, prober: Prober, ctx: RunContext,
): Promise<void> {
  const founderEmail = `${ctx.runId}-solo-founder@potriv.test`.toLowerCase();

  const created = await client.post('/auth/register-admin', {
    body: {
      name: 'QA Solo Founder',
      email: founderEmail,
      password: DEFAULT_PASSWORD,
      organizationName: `QA Solo Org ${ctx.runId}`,
      headquarterAddress: 'Test Address 1',
    },
  });
  if (!created.ok) {
    prober.record({
      id: 'bootstrap.setup', kind: 'success', description: 'register a solo organization',
      passed: false, message: `could not register: HTTP ${created.status}`,
    });
    return;
  }

  const body = created.body as Record<string, unknown>;
  const founderId = String(body.userId ?? '');
  const inviteToken = inviteTokenFrom(String(body.employeeInviteUrl ?? ''));
  const founder = await login(client, {
    email: founderEmail, as: 'soloFounder', role: 'ORGANIZATION_ADMIN',
  });

  // The exception stays shut for an organization that has other members: orgA was
  // built with an admin, an employee and two managers.
  await prober.run({
    id: 'bootstrap.self.rejected.multiPerson', kind: 'role', method: 'PATCH',
    template: '/users/{userId}/roles', url: `/users/${ctx.orgA.admin.userId}/roles`,
    expect: 400, actor: ctx.orgA.admin,
    options: { body: { roles: ['EMPLOYEE', 'ORGANIZATION_ADMIN', 'DEPARTMENT_MANAGER'] } },
  });

  // SYSTEM_ADMIN is never self-assignable, solo or not.
  await prober.run({
    id: 'bootstrap.self.rejected.systemAdmin', kind: 'role', method: 'PATCH',
    template: '/users/{userId}/roles', url: `/users/${founderId}/roles`,
    expect: 400, actor: founder,
    options: { body: { roles: ['EMPLOYEE', 'ORGANIZATION_ADMIN', 'SYSTEM_ADMIN'] } },
  });

  // Nor may the exception be used to shed a role.
  await prober.run({
    id: 'bootstrap.self.rejected.removal', kind: 'role', method: 'PATCH',
    template: '/users/{userId}/roles', url: `/users/${founderId}/roles`,
    expect: 400, actor: founder,
    options: { body: { roles: ['EMPLOYEE', 'DEPARTMENT_MANAGER'] } },
  });

  // The permitted case.
  await prober.run({
    id: 'bootstrap.self.allowed', kind: 'success', method: 'PATCH',
    template: '/users/{userId}/roles', url: `/users/${founderId}/roles`,
    expect: 200, actor: founder,
    options: {
      body: {
        roles: ['EMPLOYEE', 'ORGANIZATION_ADMIN', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER'],
      },
    },
    check: (response) => {
      const roles = (response.body as { roles?: string[] } | null)?.roles ?? [];
      const missing = ['EMPLOYEE', 'ORGANIZATION_ADMIN', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER']
        .filter((role) => !roles.includes(role));
      return missing.length === 0 ? null : `missing roles after bootstrap: ${missing.join(', ')}`;
    },
  });

  // Authorities travel in the access token, so the founder needs a fresh one.
  const operational = await login(client, {
    email: founderEmail, as: 'soloFounderOperational', role: 'PROJECT_MANAGER',
  });

  // The workflow the blocker actually blocked, end to end.
  const department = await prober.run({
    id: 'bootstrap.workflow.department', kind: 'success', method: 'POST',
    template: '/departments', url: '/departments',
    expect: 201, actor: operational,
    options: { body: { name: `Solo Department ${ctx.runId}` } },
  });
  const departmentId = String((department.body as Record<string, unknown>)?.departmentId ?? '');

  await prober.run({
    id: 'bootstrap.workflow.manager', kind: 'success', method: 'PUT',
    template: '/departments/{departmentId}/manager',
    url: `/departments/${departmentId}/manager`,
    expect: 200, actor: operational, options: { body: { userId: founderId } },
  });

  await prober.run({
    id: 'bootstrap.workflow.member', kind: 'success', method: 'POST',
    template: '/departments/{departmentId}/members/{userId}',
    url: `/departments/${departmentId}/members/${founderId}`,
    expect: 200, actor: operational,
  });

  await prober.run({
    id: 'bootstrap.workflow.project', kind: 'success', method: 'POST',
    template: '/projects', url: '/projects',
    expect: 201, actor: operational,
    options: {
      body: {
        name: `Solo Project ${ctx.runId}`,
        period: 'FIXED',
        startDate: ctx.utcToday,
        // A FIXED project requires a deadline on or after the start date.
        deadlineDate: plusDays(ctx.utcToday, 90),
        status: 'NOT_STARTED',
        generalDescription: 'Created during solo organization setup.',
        technologyStack: ['Java'],
        teamRoles: [],
      },
    },
  });

  await prober.run({
    id: 'bootstrap.workflow.reviewQueue', kind: 'success', method: 'GET',
    template: '/department/project-proposals', url: '/department/project-proposals',
    expect: 200, actor: operational,
  });

  // Once a second person exists the exception closes, even for the same founder.
  await prober.run({
    id: 'bootstrap.setup.second', kind: 'success', method: 'POST',
    template: '/auth/register-employee/{inviteToken}',
    url: `/auth/register-employee/${inviteToken}`,
    expect: 201,
    options: {
      body: {
        name: 'QA Solo Second',
        email: `${ctx.runId}-solo-second@potriv.test`.toLowerCase(),
        password: DEFAULT_PASSWORD,
      },
    },
  });

  await prober.run({
    id: 'bootstrap.self.rejected.afterGrowth', kind: 'role', method: 'PATCH',
    template: '/users/{userId}/roles', url: `/users/${founderId}/roles`,
    expect: 400, actor: operational,
    options: {
      body: {
        roles: ['EMPLOYEE', 'ORGANIZATION_ADMIN', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER'],
      },
    },
  });
}

/** `YYYY-MM-DD` plus a number of days, in UTC. */
function plusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
