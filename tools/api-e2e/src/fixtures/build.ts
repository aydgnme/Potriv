import type { ApiClient } from '../http/client.js';
import {
  DEFAULT_PASSWORD, SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD,
  field, identity, inviteTokenFrom, login, plusDays, utcToday,
  type Organization, type Person, type RunContext,
} from './context.js';

/**
 * Builds the whole world through the real API, in dependency order.
 *
 * If any step here fails the run is BLOCKED rather than FAILED: the suite could
 * not construct its preconditions, which is a different statement from "an
 * endpoint is broken".
 */

async function expect(
  promise: Promise<{ status: number; ok: boolean; body: unknown; redacted: { response: string } }>,
  status: number,
  what: string,
) {
  const response = await promise;
  if (response.status !== status) {
    throw new Error(`${what}: expected ${status}, got ${response.status} ${response.redacted.response}`);
  }
  return response;
}

async function buildOrganization(
  client: ApiClient,
  runId: string,
  label: 'A' | 'B',
): Promise<Organization> {
  const adminEmail = identity(runId, 'admin', label);
  const created = await expect(
    client.post('/auth/register-admin', {
      body: {
        name: `QA API Admin ${label}`,
        email: adminEmail,
        password: DEFAULT_PASSWORD,
        organizationName: `QA API Org ${label} ${runId}`,
        headquarterAddress: 'Test Address 1',
      },
    }),
    201,
    `register org ${label} admin`,
  );

  const organizationId = field(created.body, 'organizationId', 'register-admin');
  const inviteToken = inviteTokenFrom(
    field(created.body, 'employeeInviteUrl', 'register-admin'),
  );
  const admin = await login(client,
    { email: adminEmail, as: `org${label}Admin`, role: 'ORGANIZATION_ADMIN' });

  const employee = await registerEmployee(client, runId, label, 'employee', inviteToken, 'EMPLOYEE');
  const departmentManager = await registerEmployee(
    client, runId, label, 'deptmgr', inviteToken, 'DEPARTMENT_MANAGER');
  const projectManager = await registerEmployee(
    client, runId, label, 'projmgr', inviteToken, 'PROJECT_MANAGER');

  await grantRoles(client, admin, departmentManager, ['EMPLOYEE', 'DEPARTMENT_MANAGER']);
  await grantRoles(client, admin, projectManager, ['EMPLOYEE', 'PROJECT_MANAGER']);

  return {
    label,
    organizationId,
    admin,
    inviteToken,
    // Registration returns an id, not a session — every actor needs a real login.
    employee: await login(client,
      { email: employee.email, as: `org${label}Employee`, role: 'EMPLOYEE' }),
    departmentManager: await login(client,
      { email: departmentManager.email, as: `org${label}DepartmentManager`, role: 'DEPARTMENT_MANAGER' }),
    projectManager: await login(client,
      { email: projectManager.email, as: `org${label}ProjectManager`, role: 'PROJECT_MANAGER' }),
    departmentId: '',
    teamRoleId: '',
    skillCategoryId: '',
    skillId: '',
    projectId: '',
    proposalId: '',
    allocationId: '',
    deallocationProposalId: '',
  };
}

async function registerEmployee(
  client: ApiClient, runId: string, org: string, role: string,
  inviteToken: string, actorRole: string,
): Promise<Person> {
  const email = identity(runId, role, org);
  const created = await expect(
    client.post(`/auth/register-employee/${inviteToken}`, {
      body: { name: `QA ${role} ${org}`, email, password: DEFAULT_PASSWORD },
    }),
    201,
    `register ${role} in org ${org}`,
  );
  return {
    name: `org${org}${role}`,
    role: actorRole,
    email,
    password: DEFAULT_PASSWORD,
    userId: field(created.body, 'userId', 'register-employee'),
  };
}

async function grantRoles(
  client: ApiClient, admin: Person, target: Person, roles: string[],
): Promise<void> {
  await expect(
    client.patch(`/users/${target.userId}/roles`, { actor: admin, body: { roles } }),
    200,
    `grant ${roles.join('+')} to ${target.name}`,
  );
}

/** Departments, team roles, skills, a project and one live allocation. */
async function buildDomain(client: ApiClient, org: Organization, runId: string): Promise<void> {
  const department = await expect(
    client.post('/departments', {
      actor: org.admin,
      body: { name: `QA Engineering ${org.label} ${runId}` },
    }),
    201, `create department in org ${org.label}`,
  );
  org.departmentId = field(department.body, 'departmentId', 'create department');

  await expect(
    client.put(`/departments/${org.departmentId}/manager`, {
      actor: org.admin, body: { userId: org.departmentManager.userId },
    }),
    200, 'assign department manager',
  );

  // Membership is @DepartmentManagerOnly, not the organization admin's.
  for (const person of [org.employee, org.projectManager]) {
    await expect(
      client.post(`/departments/${org.departmentId}/members/${person.userId}`, {
        actor: org.departmentManager,
      }),
      200, `add ${person.name} to department`,
    );
  }

  const teamRole = await expect(
    client.post('/team-roles', {
      actor: org.admin, body: { name: `QA Backend ${org.label} ${runId}`, description: 'e2e' },
    }),
    201, 'create team role',
  );
  org.teamRoleId = field(teamRole.body, 'teamRoleId', 'create team role');

  const category = await expect(
    client.post('/skill-categories', {
      actor: org.departmentManager, body: { name: `QA Languages ${org.label} ${runId}` },
    }),
    201, 'create skill category',
  );
  org.skillCategoryId = field(category.body, 'categoryId', 'create skill category');

  const skill = await expect(
    client.post('/skills', {
      actor: org.departmentManager,
      body: { categoryId: org.skillCategoryId, name: `QA Java ${org.label} ${runId}` },
    }),
    201, 'create skill',
  );
  org.skillId = field(skill.body, 'skillId', 'create skill');

  await expect(
    client.post(`/skills/${org.skillId}/departments/current`, { actor: org.departmentManager }),
    200, 'link skill to department',
  );

  await expect(
    client.post('/me/skills', {
      actor: org.employee,
      body: { skillId: org.skillId, level: 'DOES', experience: 'ONE_TO_TWO_YEARS' },
    }),
    201, 'employee self-assigns skill',
  );

  const today = utcToday();
  const project = await expect(
    client.post('/projects', {
      actor: org.projectManager,
      body: {
        name: `QA API Project ${org.label} ${runId}`,
        period: 'FIXED',
        startDate: today,
        deadlineDate: plusDays(today, 90),
        status: 'STARTING',
        generalDescription: 'Created by the API E2E suite',
        technologyStack: ['Java', 'PostgreSQL'],
        teamRoles: [{ teamRoleId: org.teamRoleId, requiredMembers: 1 }],
      },
    }),
    201, 'create project',
  );
  org.projectId = field(project.body, 'projectId', 'create project');

  const proposal = await expect(
    client.post(`/projects/${org.projectId}/assignment-proposals`, {
      actor: org.projectManager,
      body: {
        employeeId: org.employee.userId,
        workHoursPerDay: 4,
        teamRoleIds: [org.teamRoleId],
        comments: 'e2e assignment',
      },
    }),
    201, 'create assignment proposal',
  );
  org.proposalId = field(proposal.body, 'proposalId', 'create assignment proposal');

  const accepted = await expect(
    client.post(`/department/project-proposals/assignments/${org.proposalId}/accept`, {
      actor: org.departmentManager,
    }),
    200, 'accept assignment proposal',
  );
  // AssignmentReviewResponse nests the created allocation.
  const allocation = (accepted.body as { allocation?: { allocationId?: string } })?.allocation;
  org.allocationId = String(allocation?.allocationId ?? '');
}

export async function buildWorld(client: ApiClient, runId: string): Promise<RunContext> {
  const orgA = await buildOrganization(client, runId, 'A');
  const orgB = await buildOrganization(client, runId, 'B');
  await buildDomain(client, orgA, runId);
  await buildDomain(client, orgB, runId);

  // The bootstrap admin is the one actor with its own credential, so it is the
  // one login that passes one. It goes last, with nothing following it.
  const systemAdmin = await login(client, {
    email: SYSTEM_ADMIN_EMAIL,
    as: 'systemAdmin',
    role: 'SYSTEM_ADMIN',
    password: SYSTEM_ADMIN_PASSWORD,
  });

  return {
    runId,
    utcToday: utcToday(),
    orgA,
    orgB,
    systemAdmin,
    nonexistentUuid: '00000000-0000-4000-8000-000000000000',
  };
}
