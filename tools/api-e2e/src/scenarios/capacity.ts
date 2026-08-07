import type { ApiClient } from '../http/client.js';
import { DEFAULT_PASSWORD, identity, login, type RunContext } from '../fixtures/context.js';
import { Prober } from './probe.js';

type Capacity = {
  maxHoursPerDay: number;
  allocatedHoursPerDay: number;
  availableHoursPerDay: number;
  requestedHoursPerDay: number;
  projectedAllocatedHoursPerDay: number;
  projectedAvailableHoursPerDay: number;
  currentlyAcceptableByCapacity: boolean;
};

/**
 * The capacity context a department manager sees before deciding, over real HTTP.
 *
 * Walks one employee from empty to committed and watches the figures move, then
 * proves the part that matters most: the context is current state, not a
 * reservation. A proposal that was acceptable when it was made can stop being
 * acceptable while it waits, and the accept endpoint — not the read model —
 * remains the authority.
 */
export async function runCapacityScenarios(
  client: ApiClient, prober: Prober, ctx: RunContext,
): Promise<void> {
  const a = ctx.orgA;

  // A fresh employee with no allocations at all.
  const email = identity(ctx.runId, 'capacity', 'A');
  const registered = await client.post(`/auth/register-employee/${a.inviteToken}`, {
    body: { name: 'QA Capacity Target', email, password: DEFAULT_PASSWORD },
  });
  if (!registered.ok) {
    prober.record({
      id: 'capacity.setup', kind: 'success', description: 'register a capacity target',
      passed: false, message: `could not register: HTTP ${registered.status}`,
    });
    return;
  }
  const employeeId = String((registered.body as Record<string, unknown>)?.userId ?? '');
  await login(client, { email, as: 'capacityTarget', role: 'EMPLOYEE' });

  const joined = await client.post(`/departments/${a.departmentId}/members/${employeeId}`, {
    actor: a.departmentManager,
  });
  if (!joined.ok) {
    prober.record({
      id: 'capacity.setup.member', kind: 'success', description: 'place them in the department',
      passed: false, message: `HTTP ${joined.status}`, requestId: joined.requestId,
    });
    return;
  }

  // 1. Fresh candidate — nothing allocated, the whole day available.
  const pending = await client.post(`/projects/${a.projectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId, workHoursPerDay: 6, teamRoleIds: [a.teamRoleId] },
  });
  const pendingId = String((pending.body as Record<string, unknown>)?.proposalId ?? '');
  prober.record({
    id: 'capacity.setup.proposal', kind: 'success',
    description: 'propose the fresh candidate for six hours',
    passed: pending.status === 201, message: `HTTP ${pending.status}`,
    requestId: pending.requestId,
  });

  await prober.run({
    id: 'capacity.fresh', kind: 'success', method: 'GET',
    template: '/department/project-proposals', url: '/department/project-proposals?status=PENDING',
    expect: 200, actor: a.departmentManager,
    check: (response) => {
      const capacity = capacityOf(response.body, pendingId);
      if (!capacity) return 'the pending proposal carried no capacity context';
      return expectCapacity(capacity, {
        maxHoursPerDay: 8,
        allocatedHoursPerDay: 0,
        availableHoursPerDay: 8,
        requestedHoursPerDay: 6,
        projectedAllocatedHoursPerDay: 6,
        projectedAvailableHoursPerDay: 2,
        currentlyAcceptableByCapacity: true,
      });
    },
  });

  // 2. Partially committed — a second project takes six of the eight hours.
  const second = await client.post('/projects', {
    actor: a.projectManager,
    body: {
      name: `QA Capacity Project ${ctx.runId}`,
      period: 'FIXED',
      startDate: ctx.utcToday,
      deadlineDate: plusDays(ctx.utcToday, 90),
      status: 'STARTING',
      generalDescription: 'Consumes capacity while another proposal waits.',
      technologyStack: ['Java'],
      teamRoles: [{ teamRoleId: a.teamRoleId, requiredMembers: 1 }],
    },
  });
  const secondProjectId = String((second.body as Record<string, unknown>)?.projectId ?? '');

  const competing = await client.post(`/projects/${secondProjectId}/assignment-proposals`, {
    actor: a.projectManager,
    body: { employeeId, workHoursPerDay: 6, teamRoleIds: [a.teamRoleId] },
  });
  const competingId = String((competing.body as Record<string, unknown>)?.proposalId ?? '');

  await prober.run({
    id: 'capacity.competingAccept', kind: 'success', method: 'POST',
    template: '/department/project-proposals/assignments/{proposalId}/accept',
    url: `/department/project-proposals/assignments/${competingId}/accept`,
    expect: 200, actor: a.departmentManager,
  });

  // 3. The first proposal is untouched, still PENDING — and no longer acceptable.
  await prober.run({
    id: 'capacity.becomesInsufficient', kind: 'success', method: 'GET',
    template: '/department/project-proposals', url: '/department/project-proposals?status=PENDING',
    expect: 200, actor: a.departmentManager,
    check: (response) => {
      const row = rowOf(response.body, pendingId);
      if (!row) return 'the waiting proposal disappeared from the pending queue';
      if (row.status !== 'PENDING') return `expected PENDING, got ${row.status}`;
      const capacity = row.capacity;
      if (!capacity) return 'the pending proposal carried no capacity context';
      return expectCapacity(capacity, {
        maxHoursPerDay: 8,
        allocatedHoursPerDay: 6,
        availableHoursPerDay: 2,
        requestedHoursPerDay: 6,
        projectedAllocatedHoursPerDay: 12,
        projectedAvailableHoursPerDay: 0,
        currentlyAcceptableByCapacity: false,
      });
    },
  });

  // 4. Acceptance revalidates — the read model advises, the guard decides.
  await prober.run({
    id: 'capacity.acceptStillRevalidates', kind: 'role', method: 'POST',
    template: '/department/project-proposals/assignments/{proposalId}/accept',
    url: `/department/project-proposals/assignments/${pendingId}/accept`,
    expect: 409, actor: a.departmentManager,
  });

  // 5. Refusing to accept does not close the proposal; rejecting it still can.
  await prober.run({
    id: 'capacity.rejectRemainsAvailable', kind: 'success', method: 'POST',
    template: '/department/project-proposals/assignments/{proposalId}/reject',
    url: `/department/project-proposals/assignments/${pendingId}/reject`,
    expect: 200, actor: a.departmentManager,
  });
}

type QueueRow = { proposalId?: string; status?: string; capacity?: Capacity | null };

function rowOf(body: unknown, proposalId: string): QueueRow | null {
  if (!Array.isArray(body)) return null;
  return (body as QueueRow[]).find((row) => row.proposalId === proposalId) ?? null;
}

function capacityOf(body: unknown, proposalId: string): Capacity | null {
  return rowOf(body, proposalId)?.capacity ?? null;
}

/** Returns an error string naming every field that does not match, or null. */
function expectCapacity(actual: Capacity, expected: Capacity): string | null {
  const wrong = (Object.keys(expected) as Array<keyof Capacity>)
    .filter((key) => actual[key] !== expected[key])
    .map((key) => `${key}=${actual[key]} (expected ${expected[key]})`);
  return wrong.length === 0 ? null : wrong.join(', ');
}

/** `YYYY-MM-DD` plus a number of days, in UTC. */
function plusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
