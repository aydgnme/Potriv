import type { ApiClient } from '../http/client.js';
import { Prober, isUuid } from './probe.js';
import {
  DEFAULT_PASSWORD, identity, inviteTokenFrom, plusDays, type RunContext,
} from '../fixtures/context.js';

/**
 * A real success probe for every REST operation.
 *
 * "Anonymous got 401" proves authentication exists, not that the endpoint works,
 * so each operation here is exercised by an actor who is genuinely allowed to
 * use it, with a body the contract accepts.
 */
export async function runSuccessScenarios(
  client: ApiClient, prober: Prober, ctx: RunContext,
): Promise<void> {
  const a = ctx.orgA;
  const suffix = `${ctx.runId}-s`;

  // ---------------------------------------------------------------- auth
  const freshAdminEmail = identity(ctx.runId, 'admin2', 'A');
  const registered = await prober.run({
    id: 'auth.register-admin.success', kind: 'success', method: 'POST',
    template: '/auth/register-admin', url: '/auth/register-admin', expect: 201,
    options: { body: {
      name: 'QA Second Admin', email: freshAdminEmail, password: DEFAULT_PASSWORD,
      organizationName: `QA API Org C ${ctx.runId}`, headquarterAddress: 'Test Address 2',
    } },
    check: (r) => isUuid((r.body as any)?.organizationId) ? null : 'organizationId is not a UUID',
  });
  const secondInvite = inviteTokenFrom(String((registered.body as any).employeeInviteUrl));

  await prober.run({
    id: 'auth.register-employee.success', kind: 'success', method: 'POST',
    template: '/auth/register-employee/{inviteToken}',
    url: `/auth/register-employee/${secondInvite}`, expect: 201,
    options: { body: {
      name: 'QA Invited', email: identity(ctx.runId, 'invited', 'C'), password: DEFAULT_PASSWORD,
    } },
  });

  const loggedIn = await prober.run({
    id: 'auth.login.success', kind: 'success', method: 'POST',
    template: '/auth/login', url: '/auth/login', expect: 200,
    options: { body: { email: a.employee.email, password: DEFAULT_PASSWORD } },
    check: (r) => (r.body as any)?.accessToken ? null : 'no accessToken in login response',
  });
  const refreshToken = String((loggedIn.body as any).refreshToken ?? '');

  await prober.run({
    id: 'auth.me.success', kind: 'success', method: 'GET',
    template: '/auth/me', url: '/auth/me', expect: 200, actor: a.employee,
    check: (r) => (r.body as any)?.email === a.employee.email ? null : 'identity mismatch',
  });

  const refreshed = await prober.run({
    id: 'auth.refresh.success', kind: 'success', method: 'POST',
    template: '/auth/refresh', url: '/auth/refresh', expect: 200,
    options: { body: { refreshToken } },
    check: (r) => (r.body as any)?.accessToken ? null : 'refresh returned no accessToken',
  });
  const rotated = String((refreshed.body as any).refreshToken ?? '');

  await prober.run({
    id: 'auth.sessions.list.success', kind: 'success', method: 'GET',
    template: '/auth/sessions', url: '/auth/sessions', expect: 200, actor: a.employee,
  });

  // A throwaway session so revoke/logout do not disturb the shared actors.
  const throwaway = await client.post('/auth/login',
    { body: { email: a.employee.email, password: DEFAULT_PASSWORD } });
  // Revoking one session of a multi-session user leaves the shared actor intact.
  const throwawayActor = {
    name: 'throwaway', role: 'EMPLOYEE',
    token: String((throwaway.body as any).accessToken),
  };
  const sessions = await client.get('/auth/sessions', { actor: throwawayActor });
  const sessionId = (sessions.body as any[])?.[0]?.sessionId;
  await prober.run({
    id: 'auth.session.revoke.success', kind: 'success', method: 'DELETE',
    template: '/auth/sessions/{sessionId}', url: `/auth/sessions/${sessionId}`,
    expect: 204, actor: throwawayActor,
  });

  // logout-all revokes every session of that account, so it gets a throwaway
  // identity of its own — running it against a shared actor would silently
  // unauthenticate half the suite.
  const disposable = await client.post(`/auth/register-employee/${a.inviteToken}`, {
    body: { name: 'QA Logout', email: identity(ctx.runId, 'logout', 'A'),
      password: DEFAULT_PASSWORD },
  });
  void disposable;
  const logoutSession = await client.post('/auth/login',
    { body: { email: identity(ctx.runId, 'logout', 'A'), password: DEFAULT_PASSWORD } });
  await prober.run({
    id: 'auth.logout.success', kind: 'success', method: 'POST',
    template: '/auth/logout', url: '/auth/logout', expect: 204,
    actor: { name: 'logout', role: 'EMPLOYEE',
      token: String((logoutSession.body as any).accessToken) },
    options: { body: { refreshToken: String((logoutSession.body as any).refreshToken) } },
  });

  const logoutAllSession = await client.post('/auth/login',
    { body: { email: identity(ctx.runId, 'logout', 'A'), password: DEFAULT_PASSWORD } });
  await prober.run({
    id: 'auth.logout-all.success', kind: 'success', method: 'POST',
    template: '/auth/logout-all', url: '/auth/logout-all', expect: 204,
    actor: { name: 'logoutAll', role: 'EMPLOYEE',
      token: String((logoutAllSession.body as any).accessToken) },
  });
  void rotated;

  // -------------------------------------------------------- organization
  await prober.run({
    id: 'organization.invite.read.success', kind: 'success', method: 'GET',
    template: '/organizations/current/invite', url: '/organizations/current/invite',
    expect: 200, actor: a.admin,
  });
  // Rotation invalidates the organization's current link, so the run adopts the
  // replacement immediately — otherwise every later registration would 400.
  const rotated2 = await prober.run({
    id: 'organization.invite.rotate.success', kind: 'success', method: 'POST',
    template: '/organizations/current/invite/rotate', url: '/organizations/current/invite/rotate',
    expect: 200, actor: a.admin,
  });
  const rotatedUrl = (rotated2.body as any)?.inviteUrl;
  if (typeof rotatedUrl === 'string' && rotatedUrl.includes('token=')) {
    (a as { inviteToken: string }).inviteToken = inviteTokenFrom(rotatedUrl);
  }

  // --------------------------------------------------------------- users
  await prober.run({
    id: 'users.list.success', kind: 'success', method: 'GET',
    template: '/users', url: '/users', expect: 200, actor: a.admin,
  });
  await prober.run({
    id: 'users.read.success', kind: 'success', method: 'GET',
    template: '/users/{userId}', url: `/users/${a.employee.userId}`, expect: 200, actor: a.admin,
  });
  await prober.run({
    id: 'users.roles.update.success', kind: 'success', method: 'PATCH',
    template: '/users/{userId}/roles', url: `/users/${a.employee.userId}/roles`,
    expect: 200, actor: a.admin, options: { body: { roles: ['EMPLOYEE'] } },
  });

  // --------------------------------------------------------- departments
  const department = await prober.run({
    id: 'departments.create.success', kind: 'success', method: 'POST',
    template: '/departments', url: '/departments', expect: 201, actor: a.admin,
    options: { body: { name: `QA Extra Dept ${suffix}` } },
    check: (r) => isUuid((r.body as any)?.departmentId) ? null : 'departmentId is not a UUID',
  });
  const extraDepartmentId = String((department.body as any).departmentId);

  await prober.run({
    id: 'departments.list.success', kind: 'success', method: 'GET',
    template: '/departments', url: '/departments', expect: 200, actor: a.admin,
  });
  await prober.run({
    id: 'departments.read.success', kind: 'success', method: 'GET',
    template: '/departments/{departmentId}', url: `/departments/${a.departmentId}`,
    expect: 200, actor: a.admin,
  });
  await prober.run({
    id: 'departments.update.success', kind: 'success', method: 'PATCH',
    template: '/departments/{departmentId}', url: `/departments/${extraDepartmentId}`,
    expect: 200, actor: a.admin, options: { body: { name: `QA Renamed Dept ${suffix}` } },
  });
  await prober.run({
    id: 'departments.members.list.success', kind: 'success', method: 'GET',
    template: '/departments/{departmentId}/members', url: `/departments/${a.departmentId}/members`,
    expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'departments.unassigned.success', kind: 'success', method: 'GET',
    template: '/departments/unassigned-employees', url: '/departments/unassigned-employees',
    expect: 200, actor: a.departmentManager,
  });

  // Membership add/remove on the throwaway department keeps the main one stable.
  const invitee = await client.post(`/auth/register-employee/${a.inviteToken}`, {
    body: { name: 'QA Mover', email: identity(ctx.runId, 'mover', 'A'), password: DEFAULT_PASSWORD },
  });
  const moverId = String((invitee.body as any).userId);
  await prober.run({
    id: 'departments.member.add.success', kind: 'success', method: 'POST',
    template: '/departments/{departmentId}/members/{userId}',
    url: `/departments/${a.departmentId}/members/${moverId}`, expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'departments.member.remove.success', kind: 'success', method: 'DELETE',
    template: '/departments/{departmentId}/members/{userId}',
    url: `/departments/${a.departmentId}/members/${moverId}`, expect: 204, actor: a.departmentManager,
  });

  // The domain requires the target to already hold DEPARTMENT_MANAGER.
  await client.patch(`/users/${moverId}/roles`, {
    actor: a.admin, body: { roles: ['EMPLOYEE', 'DEPARTMENT_MANAGER'] },
  });
  await prober.run({
    id: 'departments.manager.assign.success', kind: 'success', method: 'PUT',
    template: '/departments/{departmentId}/manager',
    url: `/departments/${extraDepartmentId}/manager`, expect: 200, actor: a.admin,
    options: { body: { userId: moverId } },
  });
  await prober.run({
    id: 'departments.manager.remove.success', kind: 'success', method: 'DELETE',
    template: '/departments/{departmentId}/manager',
    url: `/departments/${extraDepartmentId}/manager`, expect: 204, actor: a.admin,
  });
  await prober.run({
    id: 'departments.delete.success', kind: 'success', method: 'DELETE',
    template: '/departments/{departmentId}', url: `/departments/${extraDepartmentId}`,
    expect: 204, actor: a.admin,
  });

  // ---------------------------------------------------------- team roles
  const teamRole = await prober.run({
    id: 'team-roles.create.success', kind: 'success', method: 'POST',
    template: '/team-roles', url: '/team-roles', expect: 201, actor: a.admin,
    options: { body: { name: `QA Extra Role ${suffix}`, description: 'e2e' } },
  });
  const extraTeamRoleId = String((teamRole.body as any).teamRoleId);
  await prober.run({
    id: 'team-roles.list.success', kind: 'success', method: 'GET',
    template: '/team-roles', url: '/team-roles', expect: 200, actor: a.admin,
  });
  // A project manager reads the catalogue because project role requirements are
  // catalog-backed: without this they could own a project's requirements while
  // being unable to name them. Reading is not owning — the writes below stay with
  // the admin, and the role matrix proves a PM is refused them.
  await prober.run({
    id: 'team-roles.list.projectManager', kind: 'success', method: 'GET',
    template: '/team-roles', url: '/team-roles?includeInactive=true', expect: 200,
    actor: a.projectManager,
  });
  await prober.run({
    id: 'team-roles.read.success', kind: 'success', method: 'GET',
    template: '/team-roles/{teamRoleId}', url: `/team-roles/${extraTeamRoleId}`,
    expect: 200, actor: a.admin,
  });
  await prober.run({
    id: 'team-roles.update.success', kind: 'success', method: 'PATCH',
    template: '/team-roles/{teamRoleId}', url: `/team-roles/${extraTeamRoleId}`,
    expect: 200, actor: a.admin, options: { body: { name: `QA Renamed Role ${suffix}` } },
  });
  await prober.run({
    id: 'team-roles.delete.success', kind: 'success', method: 'DELETE',
    template: '/team-roles/{teamRoleId}', url: `/team-roles/${extraTeamRoleId}`,
    expect: 204, actor: a.admin,
  });

  // -------------------------------------------------------------- skills
  const category = await prober.run({
    id: 'skill-categories.create.success', kind: 'success', method: 'POST',
    template: '/skill-categories', url: '/skill-categories', expect: 201, actor: a.departmentManager,
    options: { body: { name: `QA Extra Category ${suffix}` } },
  });
  const extraCategoryId = String((category.body as any).categoryId);
  await prober.run({
    id: 'skill-categories.list.success', kind: 'success', method: 'GET',
    template: '/skill-categories', url: '/skill-categories', expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skill-categories.read.success', kind: 'success', method: 'GET',
    template: '/skill-categories/{categoryId}', url: `/skill-categories/${extraCategoryId}`,
    expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skill-categories.update.success', kind: 'success', method: 'PATCH',
    template: '/skill-categories/{categoryId}', url: `/skill-categories/${extraCategoryId}`,
    expect: 200, actor: a.departmentManager, options: { body: { name: `QA Renamed Category ${suffix}` } },
  });

  const skill = await prober.run({
    id: 'skills.create.success', kind: 'success', method: 'POST',
    template: '/skills', url: '/skills', expect: 201, actor: a.departmentManager,
    options: { body: { categoryId: extraCategoryId, name: `QA Extra Skill ${suffix}` } },
  });
  const extraSkillId = String((skill.body as any).skillId);
  await prober.run({
    id: 'skills.list.success', kind: 'success', method: 'GET',
    template: '/skills', url: '/skills', expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skills.read.success', kind: 'success', method: 'GET',
    template: '/skills/{skillId}', url: `/skills/${extraSkillId}`, expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skills.update.success', kind: 'success', method: 'PATCH',
    template: '/skills/{skillId}', url: `/skills/${extraSkillId}`, expect: 200,
    actor: a.departmentManager, options: { body: { name: `QA Renamed Skill ${suffix}` } },
  });
  await prober.run({
    id: 'skills.department.link.success', kind: 'success', method: 'POST',
    template: '/skills/{skillId}/departments/current',
    url: `/skills/${extraSkillId}/departments/current`, expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skills.department.list.success', kind: 'success', method: 'GET',
    template: '/skills/{skillId}/departments', url: `/skills/${extraSkillId}/departments`,
    expect: 200, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skills.department.unlink.success', kind: 'success', method: 'DELETE',
    template: '/skills/{skillId}/departments/current',
    url: `/skills/${extraSkillId}/departments/current`, expect: 204, actor: a.departmentManager,
  });
  await prober.run({
    id: 'skills.delete.success', kind: 'success', method: 'DELETE',
    template: '/skills/{skillId}', url: `/skills/${extraSkillId}`, expect: 204,
    actor: a.departmentManager,
  });
  await prober.run({
    id: 'skill-categories.delete.success', kind: 'success', method: 'DELETE',
    template: '/skill-categories/{categoryId}', url: `/skill-categories/${extraCategoryId}`,
    expect: [204, 409], actor: a.departmentManager,
  });

  // ----------------------------------------------------- employee skills
  await prober.run({
    id: 'me.skills.list.success', kind: 'success', method: 'GET',
    template: '/me/skills', url: '/me/skills', expect: 200, actor: a.employee,
  });
  const mySkill = await prober.run({
    id: 'me.skills.assign.success', kind: 'success', method: 'POST',
    template: '/me/skills', url: '/me/skills', expect: 201, actor: a.projectManager,
    options: { body: { skillId: a.skillId, level: 'KNOWS', experience: 'ZERO_TO_SIX_MONTHS' } },
  });
  const employeeSkillId = String((mySkill.body as any).employeeSkillId);
  await prober.run({
    id: 'me.skills.update.success', kind: 'success', method: 'PATCH',
    template: '/me/skills/{employeeSkillId}', url: `/me/skills/${employeeSkillId}`,
    expect: 200, actor: a.projectManager,
    options: { body: { level: 'DOES', experience: 'ONE_TO_TWO_YEARS' } },
  });
  await prober.run({
    id: 'me.skills.delete.success', kind: 'success', method: 'DELETE',
    template: '/me/skills/{employeeSkillId}', url: `/me/skills/${employeeSkillId}`,
    expect: 204, actor: a.projectManager,
  });

  // ------------------------------------------------------------ projects
  const project = await prober.run({
    id: 'projects.create.success', kind: 'success', method: 'POST',
    template: '/projects', url: '/projects', expect: 201, actor: a.projectManager,
    options: { body: {
      name: `QA Extra Project ${suffix}`, period: 'FIXED', startDate: ctx.utcToday,
      deadlineDate: plusDays(ctx.utcToday, 60), status: 'NOT_STARTED',
      technologyStack: ['Java'], teamRoles: [{ teamRoleId: a.teamRoleId, requiredMembers: 1 }],
    } },
  });
  const extraProjectId = String((project.body as any).projectId);

  await prober.run({
    id: 'projects.managed.success', kind: 'success', method: 'GET',
    template: '/projects/managed', url: '/projects/managed', expect: 200, actor: a.projectManager,
  });
  await prober.run({
    id: 'projects.read.success', kind: 'success', method: 'GET',
    template: '/projects/{projectId}', url: `/projects/${a.projectId}`,
    expect: 200, actor: a.projectManager,
  });
  await prober.run({
    id: 'projects.update.success', kind: 'success', method: 'PATCH',
    template: '/projects/{projectId}', url: `/projects/${extraProjectId}`,
    expect: 200, actor: a.projectManager,
    options: { body: { generalDescription: 'updated by e2e', status: 'STARTING' } },
    check: (r) => (r.body as any)?.status === 'STARTING' ? null : 'status did not transition',
  });
  await prober.run({
    id: 'projects.details.success', kind: 'success', method: 'GET',
    template: '/projects/{projectId}/details', url: `/projects/${a.projectId}/details`,
    expect: 200, actor: a.projectManager,
  });
  await prober.run({
    id: 'projects.team.success', kind: 'success', method: 'GET',
    template: '/projects/{projectId}/team', url: `/projects/${a.projectId}/team`,
    expect: 200, actor: a.projectManager,
  });
  await prober.run({
    id: 'projects.team-finder.success', kind: 'success', method: 'POST',
    template: '/projects/{projectId}/team-finder', url: `/projects/${a.projectId}/team-finder`,
    expect: 200, actor: a.projectManager,
    options: { body: { includePartiallyAvailable: true, includeCloseToFinish: true, limit: 10 } },
    check: (r) => Array.isArray((r.body as any)?.candidates) ? null : 'no candidates array',
  });
  await prober.run({
    id: 'projects.delete.success', kind: 'success', method: 'DELETE',
    template: '/projects/{projectId}', url: `/projects/${extraProjectId}`,
    expect: [204, 409], actor: a.projectManager,
    options: { query: { confirmed: 'true' } },
  });

  // --------------------------------------------------------------- views
  await prober.run({
    id: 'views.my-projects.success', kind: 'success', method: 'GET',
    template: '/me/projects', url: '/me/projects', expect: 200, actor: a.employee,
  });
  await prober.run({
    id: 'views.department-projects.success', kind: 'success', method: 'GET',
    template: '/department/projects', url: '/department/projects',
    expect: 200, actor: a.departmentManager,
  });

  // ---------------------------------------------------------- allocation
  await prober.run({
    id: 'allocations.review-queue.success', kind: 'success', method: 'GET',
    template: '/department/project-proposals', url: '/department/project-proposals',
    expect: 200, actor: a.departmentManager,
  });

  // A second proposal exercised through reject, so the accepted one stays live.
  const rejectMe = await client.post(`/projects/${a.projectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId: a.projectManager.userId, workHoursPerDay: 2,
      teamRoleIds: [a.teamRoleId], comments: 'to be rejected' },
  });
  await prober.run({
    id: 'allocations.assignment.create.success', kind: 'success', method: 'POST',
    template: '/projects/{projectId}/assignment-proposals',
    url: `/projects/${a.projectId}/assignment-proposals`, expect: [201, 409],
    actor: a.projectManager,
    options: { body: { employeeId: a.employee.userId, workHoursPerDay: 1,
      teamRoleIds: [a.teamRoleId], comments: 'duplicate probe' } },
  });
  const rejectProposalId = String((rejectMe.body as any)?.proposalId ?? '');
  if (rejectProposalId) {
    await prober.run({
      id: 'allocations.assignment.reject.success', kind: 'success', method: 'POST',
      template: '/department/project-proposals/assignments/{proposalId}/reject',
      url: `/department/project-proposals/assignments/${rejectProposalId}/reject`,
      expect: 200, actor: a.departmentManager,
    });
  }
  // The accepted path already ran while building fixtures; record it explicitly.
  const acceptMe = await client.post(`/projects/${a.projectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId: a.projectManager.userId, workHoursPerDay: 2,
      teamRoleIds: [a.teamRoleId], comments: 'to be accepted' },
  });
  const acceptProposalId = String((acceptMe.body as any)?.proposalId ?? '');
  if (acceptProposalId) {
    await prober.run({
      id: 'allocations.assignment.accept.success', kind: 'success', method: 'POST',
      template: '/department/project-proposals/assignments/{proposalId}/accept',
      url: `/department/project-proposals/assignments/${acceptProposalId}/accept`,
      expect: 200, actor: a.departmentManager,
    });
  }

  if (a.allocationId) {
    const deallocation = await prober.run({
      id: 'allocations.deallocation.create.success', kind: 'success', method: 'POST',
      template: '/projects/{projectId}/allocations/{allocationId}/deallocation-proposals',
      url: `/projects/${a.projectId}/allocations/${a.allocationId}/deallocation-proposals`,
      expect: 201, actor: a.projectManager,
      options: { body: { reason: 'e2e deallocation' } },
    });
    const deallocationId = String((deallocation.body as any)?.proposalId ?? '');
    if (deallocationId) {
      await prober.run({
        id: 'allocations.deallocation.reject.success', kind: 'success', method: 'POST',
        template: '/department/project-proposals/deallocations/{proposalId}/reject',
        url: `/department/project-proposals/deallocations/${deallocationId}/reject`,
        expect: 200, actor: a.departmentManager,
      });
    }
    const second = await client.post(
      `/projects/${a.projectId}/allocations/${a.allocationId}/deallocation-proposals`,
      { actor: a.projectManager, body: { reason: 'e2e deallocation accepted' } });
    const secondId = String((second.body as any)?.proposalId ?? '');
    if (secondId) {
      await prober.run({
        id: 'allocations.deallocation.accept.success', kind: 'success', method: 'POST',
        template: '/department/project-proposals/deallocations/{proposalId}/accept',
        url: `/department/project-proposals/deallocations/${secondId}/accept`,
        expect: 200, actor: a.departmentManager,
      });
    }
  }

  // -------------------------------------------------------- system admin
  await prober.run({
    id: 'admin.audit-events.success', kind: 'success', method: 'GET',
    template: '/admin/security/audit-events', url: '/admin/security/audit-events',
    expect: 200, actor: ctx.systemAdmin,
  });
  const statusTarget = await client.post(`/auth/register-employee/${a.inviteToken}`, {
    body: { name: 'QA Status', email: identity(ctx.runId, 'status', 'A'),
      password: DEFAULT_PASSWORD },
  });
  await prober.run({
    id: 'admin.user-status.success', kind: 'success', method: 'PATCH',
    template: '/admin/users/{userId}/status',
    url: `/admin/users/${String((statusTarget.body as any).userId)}/status`,
    expect: 200, actor: ctx.systemAdmin, options: { body: { status: 'SUSPENDED' } },
  });

  // -------------------------------------------------------- password reset
  await prober.run({
    id: 'auth.password-reset.request.success', kind: 'success', method: 'POST',
    template: '/auth/password-reset/request', url: '/auth/password-reset/request',
    expect: 202, options: { body: { email: a.employee.email } },
  });
  // The confirm probe runs in the mail scenario, which owns the real token.
}
