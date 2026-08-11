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
