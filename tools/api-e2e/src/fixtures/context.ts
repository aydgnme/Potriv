import { DEFAULT_PASSWORD } from '../config/credentials.js';
import type { ApiClient, Actor } from '../http/client.js';

/**
 * The run's world, built through real application flows in dependency order.
 *
 * Nothing here is inserted into the database directly: if a resource cannot be
 * created through the API, that is a finding, not something to work around.
 */

export type Person = Actor & {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
};

export type Organization = {
  readonly label: 'A' | 'B';
  readonly organizationId: string;
  readonly admin: Person;
  readonly inviteToken: string;
  employee: Person;
  departmentManager: Person;
  projectManager: Person;
  departmentId: string;
  teamRoleId: string;
  skillCategoryId: string;
  skillId: string;
  projectId: string;
  proposalId: string;
  allocationId: string;
  deallocationProposalId: string;
};

export type RunContext = {
  readonly runId: string;
  /** Captured once; every date assertion is relative to this, never to the wall clock. */
  readonly utcToday: string;
  orgA: Organization;
  orgB: Organization;
  systemAdmin: Actor;
  readonly nonexistentUuid: string;
};

export const SYSTEM_ADMIN_EMAIL = 'e2e-admin@potriv.test';

// Generated per run rather than written here — see config/credentials.ts.
export { DEFAULT_PASSWORD, SYSTEM_ADMIN_PASSWORD } from '../config/credentials.js';

export function identity(runId: string, role: string, org: string): string {
  return `${runId}-${org}-${role}@potriv.test`.toLowerCase();
}

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function plusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Reads a required field from a response body, failing loudly rather than silently. */
export function field(body: unknown, name: string, where: string): string {
  const value = (body as Record<string, unknown> | null)?.[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${where}: expected a "${name}" in the response, got ${JSON.stringify(body)}`);
  }
  return value;
}

export function inviteTokenFrom(inviteUrl: string): string {
  const index = inviteUrl.indexOf('token=');
  if (index < 0) throw new Error('invite URL did not contain a token parameter');
  return inviteUrl.slice(index + 'token='.length);
}

/**
 * Who to sign in as. An object rather than five positional arguments: the
 * call sites read better, and nothing sits adjacent to the credential.
 */
export interface LoginRequest {
  readonly email: string;
  /** Name used in reports and failure messages. */
  readonly as: string;
  readonly role: string;
  /** Defaults to the generated actor password; pass one only when it differs. */
  readonly password?: string;
}

export async function login(client: ApiClient, request: LoginRequest): Promise<Person> {
  const { email, as: name, role } = request;
  const password = request.password ?? DEFAULT_PASSWORD;
  const response = await client.post('/auth/login', { body: { email, password } });
  if (!response.ok) {
    throw new Error(`login failed for ${name}: HTTP ${response.status} ${response.redacted.response}`);
  }
  const body = response.body as Record<string, unknown>;
  return {
    name,
    role,
    email,
    password,
    token: field(body, 'accessToken', 'login'),
    userId: String(body.userId ?? ''),
  };
}
