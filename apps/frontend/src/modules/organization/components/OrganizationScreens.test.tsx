import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DepartmentActionState,
  InviteActionState,
  ManagerActionState,
} from "../model/organizationActionState";
import type { Department, OrganizationMember } from "../model/organizationData";
import { managerChoices } from "../model/managerChoices";
import type { DepartmentDetail as DepartmentDetailData } from "../server/loadOrganization";

import { DepartmentDetail } from "./DepartmentDetail";
import { DepartmentList } from "./DepartmentList";
import { InvitePanel } from "./InvitePanel";

/**
 * The Organization screens as somebody uses them.
 *
 * Two things are worth stating in a test rather than a comment: a department
 * nobody manages says so operationally, and rotating the invite is a revocation
 * that must be confirmed before anything is sent.
 */

type DepartmentAction = (
  state: DepartmentActionState,
  formData: FormData,
) => Promise<DepartmentActionState>;
type ManagerAction = (
  state: ManagerActionState,
  formData: FormData,
) => Promise<ManagerActionState>;
type InviteAction = (state: InviteActionState) => Promise<InviteActionState>;

const createDepartment = vi.fn<DepartmentAction>(async () => ({}));
const updateDepartment = vi.fn<DepartmentAction>(async () => ({}));
const deleteDepartment = vi.fn<DepartmentAction>(async () => ({}));
const assignManager = vi.fn<ManagerAction>(async () => ({}));
const removeManager = vi.fn<ManagerAction>(async () => ({}));
const rotateInvite = vi.fn<InviteAction>(async () => ({}));

vi.mock("../server/actions/departmentActions", () => ({
  createDepartmentAction: (s: DepartmentActionState, f: FormData) => createDepartment(s, f),
  updateDepartmentAction: (s: DepartmentActionState, f: FormData) => updateDepartment(s, f),
  deleteDepartmentAction: (s: DepartmentActionState, f: FormData) => deleteDepartment(s, f),
}));
vi.mock("../server/actions/managerActions", () => ({
  assignDepartmentManagerAction: (s: ManagerActionState, f: FormData) => assignManager(s, f),
  removeDepartmentManagerAction: (s: ManagerActionState, f: FormData) => removeManager(s, f),
}));
vi.mock("../server/actions/inviteActions", () => ({
  rotateOrganizationInviteAction: (s: InviteActionState) => rotateInvite(s),
}));

const PLATFORM = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const QA = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function department(
  departmentId: string,
  name: string,
  manager: Department["manager"] = null,
  memberCount = 0,
): Department {
  return {
    departmentId,
    name,
    manager,
    memberCount,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
  };
}

function member(userId: string, name: string, ...roles: string[]): OrganizationMember {
  return {
    userId,
    name,
    email: `${name.toLowerCase()}@potriv.test`,
    roles: roles as OrganizationMember["roles"],
  };
}

const ANA = { userId: "u-ana", name: "Ana", email: "ana@potriv.test" };
const CARA = { userId: "u-cara", name: "Cara", email: "cara@potriv.test" };

function detailFor(
  target: Department,
  users: readonly OrganizationMember[],
  departments: readonly Department[],
): DepartmentDetailData {
  return {
    department: target,
    managers: managerChoices({ departmentId: target.departmentId, users, departments }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the department list", () => {
  const departments = [
    department(PLATFORM, "Platform", ANA, 4),
    department(QA, "QA", null, 0),
  ];

  it("shows only the columns the contract has", () => {
    render(<DepartmentList departments={departments} />);

    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Name", "Manager", "Members", "Updated", "Actions"]);
  });

  it("invents no field the endpoint does not return", () => {
    render(<DepartmentList departments={departments} />);

    const table = screen.getByRole("table").textContent ?? "";
    for (const forbidden of ["Projects", "Capacity", "Skills", "Status", "Pending"]) {
      expect(table).not.toContain(forbidden);
    }
  });

  it("preserves the order the backend sent", () => {
    // Name-ascending is already correct; re-sorting here would diverge silently.
    render(<DepartmentList departments={[department(QA, "QA"), department(PLATFORM, "Platform")]} />);

    const names = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

    expect(names).toEqual(["QA", "Platform"]);
  });

  it("reports the manager and member count exactly", () => {
    render(<DepartmentList departments={departments} />);

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]?.textContent).toContain("Ana");
    expect(rows[0]?.textContent).toContain("4");
  });

  it("says what having no manager costs, not just that there is none", () => {
    render(<DepartmentList departments={departments} />);

    expect(screen.getAllByText("No manager").length).toBe(1);
    expect(screen.getByText(/cannot be reviewed until/)).toBeInTheDocument();
  });

  it("offers a way to start when there are none", () => {
    render(<DepartmentList departments={[]} />);

    expect(screen.getByText("No departments yet.")).toBeInTheDocument();
    expect(screen.getByText(/hold people and review staffing requests/)).toBeInTheDocument();
  });

  it("links each department to its own page", () => {
    render(<DepartmentList departments={departments} />);

    expect(screen.getByRole("link", { name: "Open Platform" })).toHaveAttribute(
      "href",
      `/organization/departments/${PLATFORM}`,
    );
  });

  it("sends only a name when creating", async () => {
    const user = userEvent.setup();
    render(<DepartmentList departments={departments} />);

    await user.type(screen.getByLabelText("Department name"), "Design");
    await user.click(screen.getByRole("button", { name: "New department" }));

    const formData = createDepartment.mock.calls[0]![1];
    expect(formData.get("name")).toBe("Design");
    for (const forbidden of ["organizationId", "manager", "members", "departmentId"]) {
      expect(formData.get(forbidden)).toBeNull();
    }
  });
});

describe("the manager picker", () => {
  const users = [
    member("u-ana", "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER"),
    member("u-bob", "Bob", "EMPLOYEE"),
    member("u-cara", "Cara", "EMPLOYEE", "DEPARTMENT_MANAGER"),
  ];
  const departments = [
    department(PLATFORM, "Platform", ANA, 4),
    department(QA, "QA", CARA, 0),
  ];

  function renderDetail() {
    return render(
      <DepartmentDetail detail={detailFor(departments[0]!, users, departments)} />,
    );
  }

  it("offers one manager, not several", () => {
    renderDetail();

    // One department, one manager — checkboxes would imply co-managers.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(0);
  });

  it("marks the current manager as selected", () => {
    renderDetail();

    const ana = screen.getByRole("radio", { name: /Ana/ });
    expect(ana).toBeChecked();
    expect(ana).toBeEnabled();
  });

  it("disables somebody managing elsewhere and says which department", () => {
    renderDetail();

    const cara = screen.getByRole("radio", { name: /Cara/ });
    expect(cara).toBeDisabled();
    expect(screen.getByText(/Manages QA/)).toBeInTheDocument();
  });

  it("does not offer somebody without the role", () => {
    renderDetail();

    expect(screen.queryByRole("radio", { name: /Bob/ })).toBeNull();
  });

  it("sends the department and the chosen person only", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: "Save manager" }));

    const formData = assignManager.mock.calls[0]![1];
    expect(formData.get("departmentId")).toBe(PLATFORM);
    expect(formData.get("userId")).toBe("u-ana");
    expect([...formData.keys()].sort()).toEqual(["departmentId", "userId"]);
  });

  it("points at People when nobody holds the role", () => {
    render(
      <DepartmentDetail
        detail={detailFor(department(PLATFORM, "Platform"), [member("u-bob", "Bob", "EMPLOYEE")], [])}
      />,
    );

    expect(screen.getByText(/No eligible Department Managers yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open People" })).toHaveAttribute(
      "href",
      "/people?view=organization",
    );
  });

  it("warns when a department has no manager at all", () => {
    render(<DepartmentDetail detail={detailFor(department(PLATFORM, "Platform"), users, [])} />);

    expect(screen.getByText(/cannot be reviewed until somebody is appointed/)).toBeInTheDocument();
  });
});

describe("removing a manager", () => {
  const users = [member("u-ana", "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER")];
  const target = department(PLATFORM, "Platform", ANA, 0);

  it("explains the staffing gap and that the role survives", async () => {
    const user = userEvent.setup();
    render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    await user.click(screen.getByRole("button", { name: "Remove manager" }));

    expect(screen.getByText("Remove Ana as manager of Platform?")).toBeInTheDocument();
    expect(screen.getByText(/cannot be reviewed until another manager is appointed/)).toBeInTheDocument();
    expect(screen.getByText(/access role will not be removed/)).toBeInTheDocument();
  });

  it("offers nothing to remove when there is no manager", () => {
    render(<DepartmentDetail detail={detailFor(department(PLATFORM, "Platform"), users, [])} />);

    expect(screen.queryByRole("button", { name: "Remove manager" })).toBeNull();
  });

  it("does not leave an appointment confirmation standing after a removal", async () => {
    // Appointing and removing are separate action states, and each outlives the
    // answer it described. Unguarded, the panel ends up saying "X is now the
    // manager" directly above "this department has no manager".
    const user = userEvent.setup();
    assignManager.mockResolvedValue({ done: "Ana is now the manager of Platform." });
    const target = department(PLATFORM, "Platform", ANA, 0);
    const { rerender } = render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    await user.click(screen.getByRole("button", { name: "Save manager" }));
    expect(await screen.findByText("Ana is now the manager of Platform.")).toBeInTheDocument();

    // The removal lands and the department comes back without a manager.
    const removed = department(PLATFORM, "Platform", null, 0);
    rerender(<DepartmentDetail detail={detailFor(removed, users, [removed])} />);

    expect(screen.queryByText("Ana is now the manager of Platform.")).toBeNull();
    expect(screen.getByText(/cannot be reviewed until somebody is appointed/)).toBeInTheDocument();
  });

  it("still confirms the removal once the button is gone", async () => {
    const user = userEvent.setup();
    removeManager.mockResolvedValue({
      done: "Platform has no manager. Their Department Manager access role is unchanged.",
    });
    const target = department(PLATFORM, "Platform", ANA, 0);
    const { rerender } = render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    await user.click(screen.getByRole("button", { name: "Remove manager" }));
    const dialog = document.querySelector("dialog")!;
    await user.click(within(dialog).getByRole("button", { name: "Remove manager" }));

    const removed = department(PLATFORM, "Platform", null, 0);
    rerender(<DepartmentDetail detail={detailFor(removed, users, [removed])} />);

    // Success unmounts the button; the confirmation must not go with it.
    expect(screen.queryByRole("button", { name: "Remove manager" })).toBeNull();
    expect(
      await screen.findByText(/Department Manager access role is unchanged/),
    ).toBeInTheDocument();
  });
});

describe("deleting a department", () => {
  const users = [member("u-ana", "Ana", "EMPLOYEE", "DEPARTMENT_MANAGER")];

  it("blocks and explains while a manager is appointed", () => {
    const target = department(PLATFORM, "Platform", ANA, 0);
    render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    expect(screen.getByRole("button", { name: "Delete department" })).toBeDisabled();
    expect(screen.getByText(/Remove the manager first/)).toBeInTheDocument();
  });

  it("blocks and explains while members remain", () => {
    const target = department(PLATFORM, "Platform", null, 3);
    render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    expect(screen.getByRole("button", { name: "Delete department" })).toBeDisabled();
    expect(screen.getByText(/still has 3 people/)).toBeInTheDocument();
  });

  it("stops short of promising success when nothing known blocks it", async () => {
    const user = userEvent.setup();
    const target = department(PLATFORM, "Platform", null, 0);
    render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    await user.click(screen.getByRole("button", { name: "Delete department" }));

    // Scoped to the dialog: the panel carries the same sentence, so an unscoped
    // query matches twice and proves nothing about the confirmation.
    const dialog = within(document.querySelector("dialog")!);
    expect(dialog.getByText("Delete Platform?")).toBeInTheDocument();
    expect(dialog.getByText(/does not delete user accounts/)).toBeInTheDocument();
    expect(
      dialog.getByText(/Other linked configuration can still prevent deletion/),
    ).toBeInTheDocument();
  });

  it("offers no way to clear the blockers from here", () => {
    const target = department(PLATFORM, "Platform", ANA, 3);
    render(<DepartmentDetail detail={detailFor(target, users, [target])} />);

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Remove all members", "Delete anyway", "Force delete"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

/**
 * jsdom exposes `navigator.clipboard` as a getter with no setter, so assigning to
 * it throws. Defining the property replaces it outright.
 */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("the invite link", () => {
  const invite = {
    inviteId: "686fcfea-14c7-493f-9c7a-2aa31267723a",
    inviteUrl: "http://localhost:5173/invite?token=example-token",
    active: true,
    createdAt: "2026-08-11T13:02:36Z",
    expiresAt: null,
  };

  it("shows the whole link, selectable, and never the bare token", () => {
    render(<InvitePanel invite={{ kind: "ready", invite }} />);

    const field = screen.getByLabelText("Organization invite link") as HTMLInputElement;
    expect(field.value).toBe(invite.inviteUrl);
    expect(field.readOnly).toBe(true);

    // The token alone is a credential with no context; nothing displays it.
    const visible = document.body.textContent ?? "";
    expect(visible).not.toContain("example-token");
  });

  it("invents no expiry for a contract that has none", () => {
    render(<InvitePanel invite={{ kind: "ready", invite }} />);

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Expires", "expiry", "Valid until", "days left", "Countdown"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("copies without calling the backend", async () => {
    const writeText = vi.fn(async () => {});
    // After setup, which installs a clipboard stub of its own.
    const user = userEvent.setup();
    stubClipboard(writeText);
    render(<InvitePanel invite={{ kind: "ready", invite }} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(invite.inviteUrl);
    expect(rotateInvite).not.toHaveBeenCalled();
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });

  it("keeps the link usable when the clipboard refuses", async () => {
    const user = userEvent.setup();
    stubClipboard(async () => {
      throw new Error("denied");
    });
    render(<InvitePanel invite={{ kind: "ready", invite }} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText(/Select the link and copy it manually/)).toBeInTheDocument();
    expect(screen.getByLabelText("Organization invite link")).toBeInTheDocument();
  });

  it("rotates nothing until the consequence is confirmed", async () => {
    const user = userEvent.setup();
    render(<InvitePanel invite={{ kind: "ready", invite }} />);

    await user.click(screen.getByRole("button", { name: "Rotate link" }));
    expect(rotateInvite).not.toHaveBeenCalled();

    expect(screen.getByText("Rotate organization invite link?")).toBeInTheDocument();
    expect(screen.getByText(/stop working immediately/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(rotateInvite).not.toHaveBeenCalled();
  });

  it("rotates once when confirmed", async () => {
    const user = userEvent.setup();
    render(<InvitePanel invite={{ kind: "ready", invite }} />);

    await user.click(screen.getByRole("button", { name: "Rotate link" }));
    const dialog = document.querySelector("dialog")!;
    await user.click(within(dialog).getByRole("button", { name: "Rotate link" }));

    expect(rotateInvite).toHaveBeenCalledTimes(1);
  });

  it("offers to create one when none is active", () => {
    render(<InvitePanel invite={{ kind: "none" }} />);

    expect(screen.getByText("No active employee invite is available.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new invite link" }),
    ).toBeInTheDocument();
  });

  it("keeps an outage distinct from having no invite", () => {
    render(<InvitePanel invite={{ kind: "error" }} />);

    expect(screen.getByText(/Could not load the invite link/)).toBeInTheDocument();
    expect(screen.queryByText("No active employee invite is available.")).toBeNull();
  });
});
