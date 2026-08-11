import type { Department } from "./organizationData";

/**
 * What is known to stop a department being deleted — and what is not.
 *
 * The department contract carries a manager and a member count, so those two
 * blockers can be stated before anybody clicks. It carries nothing about linked
 * skills or any other module's deletion guard, and no endpoint in this product
 * exposes them.
 *
 * So this never claims deletion will succeed. The absence of a *known* blocker
 * is not a promise, and the confirmation says so: the backend may still refuse,
 * and its refusal is the answer.
 *
 * Nothing here removes a manager, a member or a link on the caller's behalf. A
 * delete that quietly unpicked its own dependencies would be a different, much
 * larger operation than the one the button offers.
 */

export type DeletionBlocker =
  | { readonly kind: "manager"; readonly managerName: string }
  | { readonly kind: "members"; readonly memberCount: number };

export function deletionBlockers(department: Department): readonly DeletionBlocker[] {
  const blockers: DeletionBlocker[] = [];

  if (department.manager) {
    blockers.push({ kind: "manager", managerName: department.manager.name });
  }
  if (department.memberCount > 0) {
    blockers.push({ kind: "members", memberCount: department.memberCount });
  }

  return blockers;
}

/** One sentence per blocker, naming what has to happen and where. */
export function blockerMessage(blocker: DeletionBlocker): string {
  if (blocker.kind === "manager") {
    return `${blocker.managerName} manages this department. Remove the manager first.`;
  }

  const people = blocker.memberCount === 1 ? "person" : "people";
  return `This department still has ${blocker.memberCount} ${people}. Their department manager must remove them first.`;
}
