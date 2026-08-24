import "server-only";

import {
  backendDelete,
  backendGet,
  backendPatch,
  backendPost,
  backendPut,
} from "@/modules/auth/server-public";

import type { Department, OrganizationInvite, OrganizationMember } from "../model/organizationData";

/**
 * Every backend call the Organization area makes, one typed function each.
 *
 * The paths are literals. The browser supplies identifiers, which are narrowed to
 * UUIDs by the actions before they reach here, and never a path or a method.
 *
 * All of these are organization-admin endpoints. None of the system-admin
 * `/admin/...` surface appears — the ordinary product manages what the ordinary
 * product's own API exposes, and where it exposes nothing there is no screen.
 */

export type LoadFailure = "FORBIDDEN" | "NOT_FOUND" | "ERROR";

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: LoadFailure };

function failureFor(status: number): LoadFailure {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  return "ERROR";
}

async function load<T>(path: string): Promise<Loaded<T>> {
  const outcome = await backendGet<T>(path);
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, reason: failureFor(outcome.error.status) };
}

export type MutationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string | null };

/** `GET /departments` — organization-admin only, ordered by name ascending. */
export function getDepartments(): Promise<Loaded<readonly Department[]>> {
  return load<readonly Department[]>("/departments");
}

/** `GET /departments/{id}` — 404 is anti-leak and collapses with 403. */
export function getDepartment(departmentId: string): Promise<Loaded<Department>> {
  return load<Department>(`/departments/${encodeURIComponent(departmentId)}`);
}

/**
 * `GET /users` — the organization's people, for the manager picker only.
 *
 * The Organization module reads this through its own narrow source rather than
 * importing People's, because modules do not reach into each other.
 */
export function getOrganizationMembers(): Promise<Loaded<readonly OrganizationMember[]>> {
  return load<readonly OrganizationMember[]>("/users");
}

/**
 * `GET /organizations/current/invites` — the caller's own organization only.
 *
 * A list, not a link. An organization has one outstanding invitation per
 * invited address, so there is nothing single to fetch, and nothing here
 * carries a token.
 */
export function getOrganizationInvites(): Promise<Loaded<readonly OrganizationInvite[]>> {
  return load<readonly OrganizationInvite[]>("/organizations/current/invites");
}

/** `POST /departments` — 201. The body carries a name and nothing else. */
export async function createDepartment(name: string): Promise<MutationOutcome<Department>> {
  const outcome = await backendPost<Department>("/departments", { name });
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `PATCH /departments/{id}` — only the name is editable here. */
export async function updateDepartment(
  departmentId: string,
  name: string,
): Promise<MutationOutcome<Department>> {
  const outcome = await backendPatch<Department>(
    `/departments/${encodeURIComponent(departmentId)}`,
    { name },
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `DELETE /departments/{id}` — 204, or 409 when a dependency still holds it. */
export async function deleteDepartment(departmentId: string): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(`/departments/${encodeURIComponent(departmentId)}`);
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `PUT /departments/{id}/manager` — 200 with the canonical department.
 *
 * The department is in the path, so the body carries only the user. Assigning the
 * person already appointed is an idempotent success.
 */
export async function assignDepartmentManager(
  departmentId: string,
  userId: string,
): Promise<MutationOutcome<Department>> {
  const outcome = await backendPut<Department>(
    `/departments/${encodeURIComponent(departmentId)}/manager`,
    { userId },
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/** `DELETE /departments/{id}/manager` — 204. Idempotent, and never touches roles. */
export async function removeDepartmentManager(
  departmentId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(
    `/departments/${encodeURIComponent(departmentId)}/manager`,
  );
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `POST /organizations/current/invites` — 201 with the invitation's metadata.
 *
 * The address goes out; no credential comes back. The backend generates the
 * token, stores only its hash, and mails the link itself — so this browser, this
 * server, and everything between them only ever handle metadata.
 *
 * Inviting an address that already has an outstanding invitation replaces it:
 * the previous one is revoked before the new one is issued.
 */
export async function createOrganizationInvite(
  email: string,
): Promise<MutationOutcome<OrganizationInvite>> {
  const outcome = await backendPost<OrganizationInvite>(
    "/organizations/current/invites",
    { email },
  );
  if (outcome.ok) return { ok: true, value: outcome.value };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}

/**
 * `DELETE /organizations/current/invites/{id}` — 204.
 *
 * Another organization's invitation answers 404 rather than 403, so a probe
 * cannot confirm that an identifier belongs to a real invitation elsewhere.
 */
export async function revokeOrganizationInvite(
  inviteId: string,
): Promise<MutationOutcome<void>> {
  const outcome = await backendDelete(
    `/organizations/current/invites/${encodeURIComponent(inviteId)}`,
  );
  if (outcome.ok) return { ok: true, value: undefined };
  return { ok: false, status: outcome.error.status, detail: outcome.error.detail };
}
