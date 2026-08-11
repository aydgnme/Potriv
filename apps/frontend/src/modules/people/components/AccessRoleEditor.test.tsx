import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import type { RoleActionState } from "../model/peopleActionState";
import { roleEditorState } from "../model/roleEditor";

import { AccessRoleEditor } from "./AccessRoleEditor";

/**
 * The role editor as somebody uses it.
 *
 * A locked role has to say why: "you cannot edit your own" and "the last admin
 * must stay an admin" are different facts, and a dimmed checkbox communicates
 * neither.
 */

type RoleAction = (state: RoleActionState, formData: FormData) => Promise<RoleActionState>;

const action = vi.fn<RoleAction>(async () => ({}));

vi.mock("../server/actions/roleActions", () => ({
  updateUserRolesAction: (state: RoleActionState, formData: FormData) => action(state, formData),
}));

const ME = "user-me";
const OTHER = "user-other";

function person(userId: string, ...roles: AccessRole[]) {
  return { userId, roles };
}

function renderEditor(
  target: { userId: string; roles: AccessRole[] },
  organizationUsers: readonly { userId: string; roles: AccessRole[] }[],
  currentUserId = ME,
) {
  const state = roleEditorState({ target, currentUserId, organizationUsers });
  return render(<AccessRoleEditor userId={target.userId} state={state} />);
}

beforeEach(() => {
  action.mockClear();
  action.mockResolvedValue({});
});

describe("the vocabulary on screen", () => {
  it("offers the four product roles and never System Admin", () => {
    renderEditor(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    const checkboxes = screen.getAllByRole("checkbox").map((box) => box.getAttribute("value"));
    expect(checkboxes).toEqual([
      "EMPLOYEE",
      "PROJECT_MANAGER",
      "DEPARTMENT_MANAGER",
      "ORGANIZATION_ADMIN",
    ]);
    expect(screen.queryByRole("checkbox", { name: /System/i })).toBeNull();
  });

  it("says what each role does, and what it does not", () => {
    renderEditor(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    // The two easiest things to assume wrongly.
    expect(screen.getByText(/does not appoint the person to a department/)).toBeInTheDocument();
    expect(
      screen.getByText(/does not transfer ownership of existing projects/),
    ).toBeInTheDocument();
  });
});

describe("Employee is the baseline", () => {
  it("is checked, disabled, and explains itself", () => {
    renderEditor(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    const employee = screen.getByRole("checkbox", { name: "Employee" });
    expect(employee).toBeChecked();
    expect(employee).toBeDisabled();
    expect(screen.getByText(/baseline access role/)).toBeInTheDocument();
  });

  it("is still submitted, even though a disabled control sends nothing", async () => {
    const user = userEvent.setup();
    renderEditor(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    const formData = action.mock.calls[0]![1];
    expect(formData.getAll("role")).toContain("EMPLOYEE");
  });
});

describe("what gets sent", () => {
  it("is the complete desired role set", async () => {
    const user = userEvent.setup();
    renderEditor(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Department manager" }));
    await user.click(screen.getByRole("checkbox", { name: "Project manager" }));
    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    const formData = action.mock.calls[0]![1];
    expect([...formData.getAll("role")].sort()).toEqual([
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
      "PROJECT_MANAGER",
    ]);
    expect(formData.get("userId")).toBe(OTHER);
    // Nothing about identity or organization rides along.
    for (const forbidden of ["name", "email", "organizationId"]) {
      expect(formData.get(forbidden)).toBeNull();
    }
  });
});

describe("editing yourself", () => {
  it("is read-only, and says who can do it instead", () => {
    renderEditor(
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      [person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), person(OTHER, "EMPLOYEE")],
      ME,
    );

    expect(
      screen.getByText(
        "You cannot change your own access roles. Another Organization Admin must do that.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save access roles" })).toBeNull();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });
});

describe("the solo founder", () => {
  it("can add the two manager roles but not remove anything", () => {
    renderEditor(
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      [person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN")],
      ME,
    );

    expect(screen.getByText(/only person here/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Department manager" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Project manager" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Organization admin" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save access roles" })).toBeInTheDocument();
  });

  it("suggests no sign-out after adding a capability", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ done: "Access roles updated for Me." });
    renderEditor(
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      [person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN")],
      ME,
    );

    await user.click(screen.getByRole("checkbox", { name: "Project manager" }));
    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    expect(await screen.findByText("Access roles updated for Me.")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const forbidden of ["sign out", "Sign out", "log out", "sign in again"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("the last organization admin", () => {
  it("cannot have the role unticked, and the reason is readable", () => {
    renderEditor(person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE"),
      person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    const admin = screen.getByRole("checkbox", { name: "Organization admin" });
    expect(admin).toBeChecked();
    expect(admin).toBeDisabled();
    expect(
      screen.getByText(/at least one Organization Admin/),
    ).toBeInTheDocument();
  });

  it("carries that locked role through in the payload", async () => {
    const user = userEvent.setup();
    renderEditor(person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE"),
      person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    expect([...action.mock.calls[0]![1].getAll("role")].sort()).toEqual([
      "EMPLOYEE",
      "ORGANIZATION_ADMIN",
    ]);
  });
});

describe("after the server answers", () => {
  it("shows the roles the person now holds, however their lockedness changed", async () => {
    // The solo founder's own save flips the two manager roles from addable to
    // locked-on at the same moment React resets the form. Reading `checked` from
    // the props for locked roles and from local state for the rest left them
    // locked *and* unticked — the screen denying a capability just granted.
    const user = userEvent.setup();
    const { rerender } = renderEditor(
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      [person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN")],
      ME,
    );

    await user.click(screen.getByRole("checkbox", { name: "Project manager" }));
    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    const target = person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN", "PROJECT_MANAGER");
    rerender(
      <AccessRoleEditor
        userId={ME}
        state={roleEditorState({ target, currentUserId: ME, organizationUsers: [target] })}
      />,
    );

    const pm = screen.getByRole("checkbox", { name: "Project manager" });
    expect(pm).toBeChecked();
    expect(pm).toBeDisabled();
  });

  it("keeps an ordinary edit ticked once it has been saved", async () => {
    const user = userEvent.setup();
    const { rerender } = renderEditor(person(OTHER, "EMPLOYEE"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE"),
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Project manager" }));
    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    const target = person(OTHER, "EMPLOYEE", "PROJECT_MANAGER");
    rerender(
      <AccessRoleEditor
        userId={OTHER}
        state={roleEditorState({
          target,
          currentUserId: ME,
          organizationUsers: [person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"), target],
        })}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Project manager" })).toBeChecked();
  });
});

describe("failures", () => {
  it("shows the reason without losing the form", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ error: "Cannot remove the last organization admin." });
    renderEditor(person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"), [
      person(ME, "EMPLOYEE", "ORGANIZATION_ADMIN"),
      person(OTHER, "EMPLOYEE", "ORGANIZATION_ADMIN"),
    ]);

    await user.click(screen.getByRole("button", { name: "Save access roles" }));

    expect(
      await screen.findByText("Cannot remove the last organization admin."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save access roles" })).toBeInTheDocument();
  });
});
