import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamRoleActionState } from "../model/teamRoleActionState";
import type { TeamRole } from "../model/teamRoleData";

import { TeamRoleDetail } from "./TeamRoleDetail";
import { TeamRoleList } from "./TeamRoleList";

/**
 * The team-role screens as somebody uses them.
 *
 * The thing worth pinning is the wording: "role" already means access elsewhere
 * in this product, so every one of these screens has to say what a team role is
 * not, and retiring has to read as retiring rather than deleting.
 */

type Action = (state: TeamRoleActionState, formData: FormData) => Promise<TeamRoleActionState>;

const create = vi.fn<Action>(async () => ({}));
const update = vi.fn<Action>(async () => ({}));
const deactivate = vi.fn<Action>(async () => ({}));
const reactivate = vi.fn<Action>(async () => ({}));

vi.mock("../server/actions/teamRoleActions", () => ({
  createTeamRoleAction: (s: TeamRoleActionState, f: FormData) => create(s, f),
  updateTeamRoleAction: (s: TeamRoleActionState, f: FormData) => update(s, f),
  deactivateTeamRoleAction: (s: TeamRoleActionState, f: FormData) => deactivate(s, f),
  reactivateTeamRoleAction: (s: TeamRoleActionState, f: FormData) => reactivate(s, f),
}));

const ROLE = "3e38e3cc-140c-4b89-a51d-a184c6e85700";

function teamRole(overrides: Partial<TeamRole> = {}): TeamRole {
  return {
    teamRoleId: ROLE,
    name: "Backend Engineer",
    description: "Builds the services.",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the list", () => {
  it("shows only the columns the contract has", () => {
    render(<TeamRoleList teamRoles={[teamRole()]} includeInactive={false} />);

    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Name", "Description", "State", "Updated", "Actions"]);
  });

  it("keeps the backend order", () => {
    render(
      <TeamRoleList
        teamRoles={[
          teamRole({ teamRoleId: "r-1", name: "Analyst" }),
          teamRole({ teamRoleId: "r-2", name: "Backend Engineer" }),
        ]}
        includeInactive={false}
      />,
    );

    const names = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

    expect(names).toEqual(["Analyst", "Backend Engineer"]);
  });

  it("says what a team role is not", () => {
    render(<TeamRoleList teamRoles={[teamRole()]} includeInactive={false} />);

    expect(
      screen.getByText(/do not grant application permissions/),
    ).toBeInTheDocument();
  });

  it("names no access role anywhere", () => {
    render(<TeamRoleList teamRoles={[teamRole()]} includeInactive={false} />);

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "EMPLOYEE",
      "ORGANIZATION_ADMIN",
      "DEPARTMENT_MANAGER",
      "PROJECT_MANAGER",
      "SYSTEM_ADMIN",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("marks a retired role without calling it deleted", () => {
    render(<TeamRoleList teamRoles={[teamRole({ active: false })]} includeInactive />);

    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Deleted/);
  });

  it("invents no pagination", () => {
    render(<TeamRoleList teamRoles={[teamRole()]} includeInactive={false} />);

    for (const control of ["Next", "Previous", "Load more", "Page 1"]) {
      expect(screen.queryByRole("button", { name: control })).toBeNull();
      expect(screen.queryByRole("link", { name: control })).toBeNull();
    }
  });

  it("explains what the vocabulary is for when empty", () => {
    render(<TeamRoleList teamRoles={[]} includeInactive={false} />);

    expect(screen.getByText("No team roles yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Projects declare how many people they need per role."),
    ).toBeInTheDocument();
  });

  it("toggles the retired filter through the URL", () => {
    const { unmount } = render(
      <TeamRoleList teamRoles={[teamRole()]} includeInactive={false} />,
    );
    expect(screen.getByRole("link", { name: "Show retired" })).toHaveAttribute(
      "href",
      "/organization/team-roles?includeInactive=true",
    );
    unmount();

    render(<TeamRoleList teamRoles={[teamRole()]} includeInactive />);
    expect(screen.getByRole("link", { name: "Hide retired" })).toHaveAttribute(
      "href",
      "/organization/team-roles",
    );
  });
});

describe("the detail", () => {
  it("offers an edit form with both fields", () => {
    render(<TeamRoleDetail teamRole={teamRole()} />);

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Backend Engineer");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "Builds the services.",
    );
  });

  it("sends the id and the two fields, and nothing else", async () => {
    const user = userEvent.setup();
    render(<TeamRoleDetail teamRole={teamRole()} />);

    await user.click(screen.getByRole("button", { name: "Save team role" }));

    const formData = update.mock.calls[0]![1];
    expect(formData.get("teamRoleId")).toBe(ROLE);
    expect([...formData.keys()].sort()).toEqual(["description", "name", "teamRoleId"]);
  });

  it("explains what retiring does, and what it does not", async () => {
    const user = userEvent.setup();
    render(<TeamRoleDetail teamRole={teamRole()} />);

    await user.click(screen.getByRole("button", { name: "Retire Backend Engineer" }));

    const dialog = within(document.querySelector("dialog")!);
    expect(dialog.getByText("Retire Backend Engineer?")).toBeInTheDocument();
    expect(dialog.getByText(/no longer be offered/)).toBeInTheDocument();
    expect(dialog.getByText(/already require this role are unchanged/)).toBeInTheDocument();
    // The catalogue row survives, so nothing says delete.
    expect(document.body.textContent).not.toMatch(/Delete/);
  });

  it("offers a restore instead once retired", () => {
    render(<TeamRoleDetail teamRole={teamRole({ active: false })} />);

    expect(screen.getByRole("button", { name: "Restore Backend Engineer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Retire/ })).toBeNull();
    expect(screen.getByText(/Projects that already require it are unchanged/)).toBeInTheDocument();
  });

  it("sends only the id when restoring", async () => {
    const user = userEvent.setup();
    render(<TeamRoleDetail teamRole={teamRole({ active: false })} />);

    await user.click(screen.getByRole("button", { name: "Restore Backend Engineer" }));

    const formData = reactivate.mock.calls[0]![1];
    expect([...formData.keys()]).toEqual(["teamRoleId"]);
  });

  it("shows a confirmation only while it still agrees with the state", async () => {
    // Retiring and restoring are two action states in one panel, and each
    // outlives the answer it described. Each confirmation is therefore tied to
    // the state it describes, so the panel can never say "retired" above a
    // control offering to retire.
    const user = userEvent.setup();
    deactivate.mockResolvedValue({ done: "Backend Engineer is no longer offered for new work." });
    const { rerender } = render(<TeamRoleDetail teamRole={teamRole()} />);

    await user.click(screen.getByRole("button", { name: "Retire Backend Engineer" }));
    const dialog = within(document.querySelector("dialog")!);
    await user.click(dialog.getByRole("button", { name: "Retire team role" }));

    // The change lands and the role comes back retired.
    rerender(<TeamRoleDetail teamRole={teamRole({ active: false })} />);
    expect(await screen.findByText(/no longer offered for new work/)).toBeInTheDocument();

    // Restored again: the retire confirmation must not survive it.
    rerender(<TeamRoleDetail teamRole={teamRole({ active: true })} />);
    expect(screen.queryByText(/no longer offered for new work/)).toBeNull();
  });

  it("says what a team role is not, here too", () => {
    render(<TeamRoleDetail teamRole={teamRole()} />);

    expect(screen.getByText(/do not grant application permissions/)).toBeInTheDocument();
  });
});
