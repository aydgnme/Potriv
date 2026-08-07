import type { ApiClient } from '../http/client.js';
import { DEFAULT_PASSWORD, identity, login, type RunContext } from '../fixtures/context.js';
import { Prober } from './probe.js';

/**
 * Rejection reasons, over real HTTP, asserted by reading them back rather than
 * by trusting a status code.
 *
 * Covers both proposal kinds and both shapes of the optional body, plus the
 * distinction that matters most: a deallocation proposal's own `reason` says why
 * removal was asked for, and `rejectionReason` says why the reviewer declined.
 * They are different statements by different people and must never merge.
 */
export async function runRejectionScenarios(
  client: ApiClient, prober: Prober, ctx: RunContext,
): Promise<void> {
  const a = ctx.orgA;
  const reason = 'Requested hours exceed current team capacity.';

  const employeeId = await freshDepartmentMember(client, prober, ctx);
  if (!employeeId) return;

  // ---- assignment: rejected with a reason ----
  const withReason = await client.post(`/projects/${a.projectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId, workHoursPerDay: 1, teamRoleIds: [a.teamRoleId] },
  });
  const withReasonId = String((withReason.body as Record<string, unknown>)?.proposalId ?? '');

  await prober.run({
    id: 'rejection.assignment.withReason', kind: 'success', method: 'POST',
    template: '/department/project-proposals/assignments/{proposalId}/reject',
    url: `/department/project-proposals/assignments/${withReasonId}/reject`,
    expect: 200, actor: a.departmentManager,
    options: { body: { reason: `  ${reason}  ` } },
    check: (response) => {
      const proposal = (response.body as { proposal?: Record<string, unknown> })?.proposal;
      if (proposal?.status !== 'REJECTED') return `expected REJECTED, got ${proposal?.status}`;
      return proposal?.rejectionReason === reason
        ? null
        : `expected the trimmed reason, got ${JSON.stringify(proposal?.rejectionReason)}`;
    },
  });

  // It must survive into the queue the reviewer and the requester read.
  await prober.run({
    id: 'rejection.assignment.readBack', kind: 'success', method: 'GET',
    template: '/department/project-proposals',
    url: '/department/project-proposals?status=REJECTED',
    expect: 200, actor: a.departmentManager,
    check: (response) => {
      const row = rowOf(response.body, withReasonId);
      if (!row) return 'the rejected proposal is not in the REJECTED queue';
      return row.rejectionReason === reason
        ? null
        : `queue lost the reason: ${JSON.stringify(row.rejectionReason)}`;
    },
  });

  // ---- assignment: rejected with no body at all ----
  const noBody = await client.post(`/projects/${a.projectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId, workHoursPerDay: 1, teamRoleIds: [a.teamRoleId] },
  });
  const noBodyId = String((noBody.body as Record<string, unknown>)?.proposalId ?? '');

  await prober.run({
    id: 'rejection.assignment.noBody', kind: 'success', method: 'POST',
    template: '/department/project-proposals/assignments/{proposalId}/reject',
    url: `/department/project-proposals/assignments/${noBodyId}/reject`,
    expect: 200, actor: a.departmentManager,
    check: (response) => {
      const proposal = (response.body as { proposal?: Record<string, unknown> })?.proposal;
      if (proposal?.status !== 'REJECTED') return `expected REJECTED, got ${proposal?.status}`;
      return proposal?.rejectionReason == null
        ? null
        : `a bodyless reject invented a reason: ${JSON.stringify(proposal?.rejectionReason)}`;
    },
  });

  // ---- deallocation: both shapes, and the two reasons kept apart ----
  const allocationId = await liveAllocation(client, prober, ctx, employeeId);
  if (!allocationId) return;

  const proposedFor = 'Reporting workstream ended.';
  const removal = await client.post(
    `/projects/${a.projectId}/allocations/${allocationId}/deallocation-proposals`,
    { actor: a.projectManager, body: { reason: proposedFor } },
  );
  const removalId = String((removal.body as Record<string, unknown>)?.proposalId ?? '');

  await prober.run({
    id: 'rejection.deallocation.withReason', kind: 'success', method: 'POST',
    template: '/department/project-proposals/deallocations/{proposalId}/reject',
    url: `/department/project-proposals/deallocations/${removalId}/reject`,
    expect: 200, actor: a.departmentManager,
    options: { body: { reason } },
    check: (response) => {
      const proposal = (response.body as { proposal?: Record<string, unknown> })?.proposal;
      if (proposal?.rejectionReason !== reason) {
        return `expected the reviewer's reason, got ${JSON.stringify(proposal?.rejectionReason)}`;
      }
      return proposal?.reason === proposedFor
        ? null
        : `the proposer's reason was overwritten: ${JSON.stringify(proposal?.reason)}`;
    },
  });

  // Rejecting a removal leaves the allocation active, and only a *pending*
  // proposal blocks a new one — so the same allocation can be proposed again.
  const second = await client.post(
    `/projects/${a.projectId}/allocations/${allocationId}/deallocation-proposals`,
    { actor: a.projectManager, body: { reason: proposedFor } },
  );
  const secondId = String((second.body as Record<string, unknown>)?.proposalId ?? '');

  await prober.run({
    id: 'rejection.deallocation.noBody', kind: 'success', method: 'POST',
    template: '/department/project-proposals/deallocations/{proposalId}/reject',
    url: `/department/project-proposals/deallocations/${secondId}/reject`,
    expect: 200, actor: a.departmentManager,
    check: (response) => {
      const proposal = (response.body as { proposal?: Record<string, unknown> })?.proposal;
      if (proposal?.rejectionReason != null) {
        return `a bodyless reject invented a reason: ${JSON.stringify(proposal?.rejectionReason)}`;
      }
      return proposal?.reason === proposedFor
        ? null
        : `the proposer's reason was lost: ${JSON.stringify(proposal?.reason)}`;
    },
  });

  // ---- an over-long reason is refused by ordinary validation ----
  const overlong = await client.post(`/projects/${a.projectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId, workHoursPerDay: 1, teamRoleIds: [a.teamRoleId] },
  });
  const overlongId = String((overlong.body as Record<string, unknown>)?.proposalId ?? '');

  await prober.run({
    id: 'rejection.assignment.overlongReason', kind: 'validation', method: 'POST',
    template: '/department/project-proposals/assignments/{proposalId}/reject',
    url: `/department/project-proposals/assignments/${overlongId}/reject`,
    expect: 400, actor: a.departmentManager,
    options: { body: { reason: 'x'.repeat(5001) } },
  });
}

type QueueRow = { proposalId?: string; rejectionReason?: string | null };

function rowOf(body: unknown, proposalId: string): QueueRow | null {
  if (!Array.isArray(body)) return null;
  return (body as QueueRow[]).find((row) => row.proposalId === proposalId) ?? null;
}

/** A brand-new employee inside org A's reviewed department. */
async function freshDepartmentMember(
  client: ApiClient, prober: Prober, ctx: RunContext,
): Promise<string | null> {
  const email = identity(ctx.runId, 'rejection', 'A');
  const registered = await client.post(`/auth/register-employee/${ctx.orgA.inviteToken}`, {
    body: { name: 'QA Rejection Target', email, password: DEFAULT_PASSWORD },
  });
  if (!registered.ok) {
    prober.record({
      id: 'rejection.setup', kind: 'success', description: 'register a rejection target',
      passed: false, message: `HTTP ${registered.status}`, requestId: registered.requestId,
    });
    return null;
  }
  const employeeId = String((registered.body as Record<string, unknown>)?.userId ?? '');
  await login(client, { email, as: 'rejectionTarget', role: 'EMPLOYEE' });

  const joined = await client.post(
    `/departments/${ctx.orgA.departmentId}/members/${employeeId}`,
    { actor: ctx.orgA.departmentManager },
  );
  if (!joined.ok) {
    prober.record({
      id: 'rejection.setup.member', kind: 'success', description: 'place them in the department',
      passed: false, message: `HTTP ${joined.status}`, requestId: joined.requestId,
    });
    return null;
  }
  return employeeId;
}

/** Proposes and accepts one hour so a removal has something to act on. */
async function liveAllocation(
  client: ApiClient, prober: Prober, ctx: RunContext, employeeId: string,
): Promise<string | null> {
  const proposal = await client.post(`/projects/${ctx.orgA.projectId}/assignment-proposals`, {
    actor: ctx.orgA.projectManager,
    body: { employeeId, workHoursPerDay: 1, teamRoleIds: [ctx.orgA.teamRoleId] },
  });
  const proposalId = String((proposal.body as Record<string, unknown>)?.proposalId ?? '');

  const accepted = await client.post(
    `/department/project-proposals/assignments/${proposalId}/accept`,
    { actor: ctx.orgA.departmentManager },
  );
  const allocation = (accepted.body as { allocation?: { allocationId?: string } })?.allocation;
  const allocationId = allocation?.allocationId ?? '';

  if (!accepted.ok || !allocationId) {
    prober.record({
      id: 'rejection.setup.allocation', kind: 'success',
      description: 'create a live allocation to remove',
      passed: false, message: `HTTP ${accepted.status}`, requestId: accepted.requestId,
    });
    return null;
  }
  return allocationId;
}
