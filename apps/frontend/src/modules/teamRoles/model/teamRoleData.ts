/**
 * A team role, as `GET /team-roles` returns it.
 *
 * Team roles are the organization's **staffing vocabulary** — the names projects
 * use when they say how many people they need of what kind. They are not access
 * roles: nothing here grants permission to do anything in the product, and
 * `EMPLOYEE`, `PROJECT_MANAGER` and the rest live in a different union entirely.
 *
 * Deactivation is soft. A project that already requires a role keeps requiring it
 * after the role is retired, so the row stays resolvable rather than disappearing
 * out from under existing work.
 */
export type TeamRole = {
  readonly teamRoleId: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};
