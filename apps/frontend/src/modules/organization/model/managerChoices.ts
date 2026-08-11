import type { Department, OrganizationMember } from "./organizationData";

/**
 * Who may manage a department, derived from two lists rather than remembered.
 *
 * The backend keeps a strict one-to-one relationship: one manager per
 * department, one department per manager. Nothing exposes "unassigned managers"
 * directly, so it is computed — everyone holding the role, minus everyone
 * already managing somewhere else.
 *
 * The distinction this file exists to keep visible: holding
 * `DEPARTMENT_MANAGER` is a **capability**, and a manager assignment is an
 * **appointment to one department**. Somebody can hold the role and manage
 * nothing. Appointing never grants the role, and removing an appointment never
 * takes it away.
 */

export type ManagerChoice = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** Already the manager of the department being edited. */
  readonly current: boolean;
  /** Managing a different department, so the backend would refuse. */
  readonly unavailable: boolean;
  /** Which department they manage instead — shown rather than just dimming them. */
  readonly managesInstead?: string;
};

export type ManagerChoices = {
  readonly choices: readonly ManagerChoice[];
  /** Nobody in the organization holds the role at all — a different problem. */
  readonly noneEligible: boolean;
};

export type ManagerChoicesInput = {
  readonly departmentId: string;
  /** Everyone in the organization, from a fresh `GET /users`. */
  readonly users: readonly OrganizationMember[];
  /** Every department, from a fresh `GET /departments`. */
  readonly departments: readonly Department[];
};

export function managerChoices(input: ManagerChoicesInput): ManagerChoices {
  // Where each manager is currently appointed, from the department list itself.
  const appointments = new Map<string, Department>();
  for (const department of input.departments) {
    if (department.manager) appointments.set(department.manager.userId, department);
  }

  const eligible = input.users.filter((user) => user.roles.includes("DEPARTMENT_MANAGER"));

  const choices = eligible.map((user): ManagerChoice => {
    const appointment = appointments.get(user.userId);
    const elsewhere = appointment !== undefined && appointment.departmentId !== input.departmentId;

    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      current: appointment?.departmentId === input.departmentId,
      unavailable: elsewhere,
      ...(elsewhere ? { managesInstead: appointment.name } : {}),
    };
  });

  return { choices, noneEligible: eligible.length === 0 };
}

export type ManagerAssignmentCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether this appointment can be attempted at all.
 *
 * Re-run on the server against fresh reads, so a picker rendered before somebody
 * lost the role — or took another department — cannot carry a stale answer
 * through.
 */
export function checkManagerAssignment(
  choices: ManagerChoices,
  userId: string,
): ManagerAssignmentCheck {
  const choice = choices.choices.find((candidate) => candidate.userId === userId);

  if (!choice) {
    return {
      ok: false,
      reason: "That person cannot manage a department. They need the Department Manager role.",
    };
  }

  if (choice.unavailable) {
    return {
      ok: false,
      reason: choice.managesInstead
        ? `${choice.name} already manages ${choice.managesInstead}. A person can manage only one department.`
        : `${choice.name} already manages another department.`,
    };
  }

  return { ok: true };
}
