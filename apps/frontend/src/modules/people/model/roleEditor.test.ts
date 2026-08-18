import { describe, expect, it } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import {
  PRODUCT_ROLES,
  parseRolePayload,
  roleEditorState,
  validateRoleChange,
} from "./roleEditor";

/**
 * What an organization admin may change, and what the backend will refuse.
 *
 * Three rules, all derived from data rather than remembered: Employee is the
 * baseline, you cannot edit your own roles unless you are alone in a new
 * organization, and an organization always keeps one admin.
 */

const ME = "user-me";
const OTHER = "user-other";

function person(userId: string, ...roles: AccessRole[]) {
  return { userId, roles };
}

function state(
  target: { userId: string; roles: AccessRole[] },
  organizationUsers: readonly { userId: string; roles: AccessRole[] }[],
  currentUserId = ME,
) {
  return roleEditorState({ target, currentUserId, organizationUsers });
}

function optionFor(editor: ReturnType<typeof state>, role: AccessRole) {
  const option = editor.options.find((candidate) => candidate.role === role);
  if (!option) throw new Error(`no option for ${role}`);
  return option;
}

describe("the role vocabulary", () => {
  it("is the four ordinary product roles, and never SYSTEM_ADMIN", () => {
    expect(PRODUCT_ROLES).toEqual([
      "EMPLOYEE",
      "PROJECT_MANAGER",
      "DEPARTMENT_MANAGER",
      "ORGANIZATION_ADMIN",
    ]);
    expect(PRODUCT_ROLES).not.toContain("SYSTEM_ADMIN");
  });

  it("offers exactly those four in the editor", () => {
    const editor = state(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    expect(editor.options.map((option) => option.role)).toEqual([...PRODUCT_ROLES]);
  });
});

describe("Employee is the baseline", () => {
  it("is always selected and never removable", () => {
    const editor = state(person(OTHER, "EMPLOYEE", "PROJECT_MANAGER"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE", "PROJECT_MANAGER"),
    ]);

    const employee = optionFor(editor, "EMPLOYEE");
    expect(employee.selected).toBe(true);
    expect(employee.locked).toBe(true);
    expect(employee.lockReason).toContain("baseline");
  });

  it("is selected even for somebody the backend reported without it", () => {
    // Unticking it and watching it reappear would misreport what was saved.
    const editor = state(person(OTHER, "PROJECT_MANAGER"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "PROJECT_MANAGER"),
    ]);

    expect(optionFor(editor, "EMPLOYEE").selected).toBe(true);
  });
});

describe("editing somebody else", () => {
  it("leaves the manager roles free to change", () => {
    const editor = state(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    expect(editor.editable).toBe(true);
    expect(optionFor(editor, "PROJECT_MANAGER").locked).toBe(false);
    expect(optionFor(editor, "DEPARTMENT_MANAGER").locked).toBe(false);
    expect(optionFor(editor, "ORGANIZATION_ADMIN").locked).toBe(false);
  });
});

describe("editing yourself", () => {
  it("is refused outright in an organization with other people", () => {
    const editor = state(person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    expect(editor.editable).toBe(false);
    expect(editor.readOnlyReason).toContain("Another Organization Admin");
    expect(editor.options.every((option) => option.locked)).toBe(true);
  });

  it("is refused for a lone person who is not the admin", () => {
    // The exception exists to let a founder set up; it is not a general licence.
    const editor = state(person(ME, "EMPLOYEE"), [person(ME, "EMPLOYEE")]);

    expect(editor.editable).toBe(false);
  });
});

describe("the solo founder exception", () => {
  const solo = () =>
    state(person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

  it("lets a founder alone in the organization add the two manager roles", () => {
    const editor = solo();

    expect(editor.editable).toBe(true);
    expect(optionFor(editor, "DEPARTMENT_MANAGER").locked).toBe(false);
    expect(optionFor(editor, "PROJECT_MANAGER").locked).toBe(false);
    expect(editor.notice).toContain("only person here");
  });

  it("does not let them remove anything they already have", () => {
    const editor = solo();

    const admin = optionFor(editor, "ORGANIZATION_ADMIN");
    expect(admin.selected).toBe(true);
    expect(admin.locked).toBe(true);
    expect(optionFor(editor, "EMPLOYEE").locked).toBe(true);
  });

  it("closes the moment a second person exists", () => {
    const editor = state(person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    expect(editor.editable).toBe(false);
  });
});

describe("the last organization admin", () => {
  it("cannot have the role removed", () => {
    const editor = state(person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE"),
      person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    const admin = optionFor(editor, "ORGANIZATION_ADMIN");
    expect(admin.locked).toBe(true);
    expect(admin.lockReason).toContain("at least one Organization Admin");
  });

  it("can once there is a second admin", () => {
    const editor = state(person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    expect(optionFor(editor, "ORGANIZATION_ADMIN").locked).toBe(false);
  });

  it("does not lock the role for somebody who never had it", () => {
    const editor = state(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    expect(optionFor(editor, "ORGANIZATION_ADMIN").locked).toBe(false);
  });
});

describe("parseRolePayload", () => {
  function accepted(raw: readonly string[]): readonly AccessRole[] {
    const parsed = parseRolePayload(raw);
    if (!parsed.ok) throw new Error(`expected ${JSON.stringify(raw)} to be accepted`);
    return parsed.roles;
  }

  it("always includes Employee", () => {
    // The backend treats it as the organization baseline and would add it anyway,
    // so supplying it changes no authority.
    expect(accepted(["PROJECT_MANAGER"])).toContain("EMPLOYEE");
    expect(accepted([])).toEqual(["EMPLOYEE"]);
  });

  it("de-duplicates a repeated known role", () => {
    expect(accepted(["PROJECT_MANAGER", "PROJECT_MANAGER", "EMPLOYEE"])).toEqual([
      "EMPLOYEE",
      "PROJECT_MANAGER",
    ]);
  });

  it("keeps the complete desired set", () => {
    expect([...accepted(["EMPLOYEE", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"])].sort()).toEqual([
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
      "PROJECT_MANAGER",
    ]);
  });

  describe("rejects anything outside the product vocabulary", () => {
    // Dropping an unknown role would leave a different, perfectly valid request
    // behind — this endpoint replaces the whole set, so `EMPLOYEE + SYSTEM_ADMIN`
    // against an existing project manager would quietly become "remove PROJECT_MANAGER".
    for (const unknown of ["SYSTEM_ADMIN", "SUPER_ADMIN", "ROOT", "ADMINISTRATOR", "banana"]) {
      it(unknown, () => {
        expect(parseRolePayload(["EMPLOYEE", unknown])).toEqual({ ok: false });
      });
    }

    it("even when every other value is legitimate", () => {
      expect(
        parseRolePayload(["EMPLOYEE", "SYSTEM_ADMIN", "PROJECT_MANAGER"]),
      ).toEqual({ ok: false });
    });

    it("including near-misses in case or spelling", () => {
      for (const raw of ["employee", "Project_Manager", "", " EMPLOYEE"]) {
        expect(parseRolePayload([raw])).toEqual({ ok: false });
      }
    });
  });
});

describe("validateRoleChange", () => {
  const editingOther = () =>
    state(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

  it("allows an ordinary change", () => {
    expect(
      validateRoleChange(editingOther(), ["EMPLOYEE", "PROJECT_MANAGER"]),
    ).toEqual({ ok: true });
  });

  it("refuses dropping a locked-on role", () => {
    const result = validateRoleChange(editingOther(), ["PROJECT_MANAGER"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("baseline");
  });

  it("refuses removing the last admin's role", () => {
    const editor = state(person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE"),
      person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    const result = validateRoleChange(editor, ["EMPLOYEE"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("at least one Organization Admin");
  });

  it("refuses any change at all when the editor is read-only", () => {
    const editor = state(person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    const result = validateRoleChange(editor, ["EMPLOYEE", "ORGANIZATION_ADMIN"]);

    expect(result.ok).toBe(false);
  });

  it("refuses a solo founder removing something they hold", () => {
    const editor = state(person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    const result = validateRoleChange(editor, ["EMPLOYEE", "PROJECT_MANAGER"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cannot remove your own roles");
  });

  it("allows a solo founder adding a manager role", () => {
    const editor = state(person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    expect(
      validateRoleChange(editor, [
        "EMPLOYEE",
        "ORGANIZATION_ADMIN",
        "DEPARTMENT_MANAGER",
        "PROJECT_MANAGER",
      ]),
    ).toEqual({ ok: true });
  });
});

/**
 * The organizational model, defended against the flattenings that look tidier.
 *
 * ```
 * access role != department membership
 *             != manager appointment
 *             != project ownership
 * ```
 *
 * Each of these is one lock away from a plausible simplification that would let
 * somebody grant themselves authority or strand an organization without an admin.
 */
describe("access role is not appointment, membership or ownership", () => {
  const founder = { userId: "u1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] } as const;

  it("says nothing about appointment when granting DEPARTMENT_MANAGER", () => {
    const state = roleEditorState({
      target: { userId: "u2", roles: ["EMPLOYEE"] },
      currentUserId: "u1",
      organizationUsers: [founder, { userId: "u2", roles: ["EMPLOYEE"] }],
    });

    const dm = state.editable ? state.options.find((o) => o.role === "DEPARTMENT_MANAGER") : undefined;

    // The role is grantable here; being appointed to a department is a separate
    // operation in Organization, and this screen must not imply otherwise.
    expect(dm?.locked).toBe(false);
    expect(dm?.selected).toBe(false);
  });

  it("never offers SYSTEM_ADMIN in the ordinary product editor", () => {
    const state = roleEditorState({
      target: { userId: "u2", roles: ["EMPLOYEE"] },
      currentUserId: "u1",
      organizationUsers: [founder, { userId: "u2", roles: ["EMPLOYEE"] }],
    });

    const roles = state.editable ? state.options.map((o) => o.role) : [];
    expect(roles).not.toContain("SYSTEM_ADMIN");
  });
});

describe("the founder bootstrap is exactly as narrow as the backend's", () => {
  const solo = { userId: "u1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] } as const;

  it("lets a solo founder add only the two setup roles to themselves", () => {
    const state = roleEditorState({
      target: solo,
      currentUserId: "u1",
      organizationUsers: [solo],
    });

    expect(state.editable).toBe(true);
    const byRole = state.editable
      ? Object.fromEntries(state.options.map((o) => [o.role, o]))
      : {};

    // Addable: the two the backend's SELF_ASSIGNABLE_SETUP_ROLES allows.
    expect(byRole.DEPARTMENT_MANAGER?.locked).toBe(false);
    expect(byRole.PROJECT_MANAGER?.locked).toBe(false);
    // Not removable: additive only, so what they already hold is locked on.
    expect(byRole.ORGANIZATION_ADMIN?.locked).toBe(true);
    expect(byRole.EMPLOYEE?.locked).toBe(true);
  });

  it("closes the exception the moment a second person exists", () => {
    const state = roleEditorState({
      target: solo,
      currentUserId: "u1",
      organizationUsers: [solo, { userId: "u2", roles: ["EMPLOYEE"] }],
    });

    // Back to the ordinary rule: nobody rewrites their own authorization.
    expect(state.editable).toBe(false);
    expect(state.editable ? "" : state.readOnlyReason).toMatch(/cannot change your own access roles/i);
  });
});

describe("an organization can never be left without an admin", () => {
  it("locks the last admin's ORGANIZATION_ADMIN role", () => {
    const admin = { userId: "u1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] } as const;
    const other = { userId: "u2", roles: ["EMPLOYEE"] } as const;

    const state = roleEditorState({
      target: admin,
      currentUserId: "u2",
      organizationUsers: [admin, other],
    });

    const orgAdmin = state.editable
      ? state.options.find((o) => o.role === "ORGANIZATION_ADMIN")
      : undefined;

    expect(orgAdmin?.locked).toBe(true);
    expect(orgAdmin?.lockReason).toMatch(/at least one Organization Admin/i);
  });

  it("unlocks it once a second admin exists", () => {
    const a = { userId: "u1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] } as const;
    const b = { userId: "u2", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] } as const;

    const state = roleEditorState({ target: a, currentUserId: "u2", organizationUsers: [a, b] });
    const orgAdmin = state.editable
      ? state.options.find((o) => o.role === "ORGANIZATION_ADMIN")
      : undefined;

    expect(orgAdmin?.locked).toBe(false);
  });
});

describe("EMPLOYEE is baseline access, always", () => {
  it("stays selected and locked for everybody", () => {
    const admin = { userId: "u1", roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"] } as const;
    const target = { userId: "u2", roles: ["EMPLOYEE", "PROJECT_MANAGER"] } as const;

    const state = roleEditorState({ target, currentUserId: "u1", organizationUsers: [admin, target] });
    const employee = state.editable ? state.options.find((o) => o.role === "EMPLOYEE") : undefined;

    // The backend re-adds it regardless; showing it as removable would be the UI
    // lying about what will be saved.
    expect(employee?.selected).toBe(true);
    expect(employee?.locked).toBe(true);
  });
});
