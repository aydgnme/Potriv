import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import type { MembershipActionState } from "../model/peopleActionState";
import type { DepartmentUser, OrganizationUser } from "../model/peopleData";
import { grantedViews, type PeopleView } from "../model/peopleQuery";
import type { DepartmentData, PeopleData } from "../server/loadPeople";

import { PeoplePage } from "./PeoplePage";

/**
 * What People shows, and to whom.
 *
 * The two views answer different questions from different endpoints — including,
 * easy to miss, through differently named role fields. Both are places where a
 * plausible-looking shared shape would render an empty chip list.
 */

type MembershipAction = (
  state: MembershipActionState,
  formData: FormData,
) => Promise<MembershipActionState>;

const addMember = vi.fn<MembershipAction>(async () => ({}));
const removeMember = vi.fn<MembershipAction>(async () => ({}));

vi.mock("../server/actions/membershipActions", () => ({
  addDepartmentMemberAction: (s: MembershipActionState, f: FormData) => addMember(s, f),
  removeDepartmentMemberAction: (s: MembershipActionState, f: FormData) => removeMember(s, f),
}));

const ME = "user-me";

function orgUser(userId: string, name: string, ...roles: AccessRole[]): OrganizationUser {
  return { userId, organizationId: "org-1", name, email: `${name}@potriv.test`, roles };
}

function deptUser(userId: string, name: string, ...accessRoles: AccessRole[]): DepartmentUser {
  return { userId, name, email: `${name}@potriv.test`, accessRoles };
}

function organizationData(users: readonly OrganizationUser[]): PeopleData {
  return { view: "organization", users: { ok: true, value: users } };
}

function departmentData(department: DepartmentData): PeopleData {
  return { view: "department", department };
}

function readyDepartment(
  members: readonly DepartmentUser[],
  unassigned: readonly DepartmentUser[],
): DepartmentData {
  return {
    kind: "ready",
    department: { departmentId: "d1", name: "Platform Engineering" },
    members: { ok: true, value: members },
    unassigned: { ok: true, value: unassigned },
  };
}

function renderPeople(
  roles: readonly AccessRole[],
  data: PeopleData,
  active: PeopleView = data.view,
) {
  return render(
    <PeoplePage
      views={grantedViews(roles)}
      active={active}
      data={data}
      currentUserId={ME}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("view navigation", () => {
  const OA: readonly AccessRole[] = ["EMPLOYEE", "ORGANIZATION_ADMIN"];
  const DM: readonly AccessRole[] = ["EMPLOYEE", "DEPARTMENT_MANAGER"];
  const BOTH: readonly AccessRole[] = [...OA, "DEPARTMENT_MANAGER"];

  it("offers nothing to navigate when only one view is granted", () => {
    renderPeople(OA, organizationData([orgUser(ME, "Me", "EMPLOYEE", "ORGANIZATION_ADMIN")]));

    expect(screen.queryByRole("navigation", { name: "People views" })).toBeNull();
  });

  it("offers both views to somebody holding both roles", () => {
    renderPeople(BOTH, organizationData([]));

    const nav = screen.getByRole("navigation", { name: "People views" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Organization",
      "My department",
    ]);
    expect(within(nav).getByRole("link", { current: "page" })).toHaveTextContent("Organization");
  });

  it("navigates rather than pretending to be tabs", () => {
    renderPeople(BOTH, organizationData([]));

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("combobox", { name: /view/i })).toBeNull();
  });

  it("shows a department manager their own view", () => {
    renderPeople(DM, departmentData(readyDepartment([], [])));

    expect(screen.getByRole("heading", { name: "Platform Engineering" })).toBeInTheDocument();
  });
});

describe("organization people", () => {
  const OA: readonly AccessRole[] = ["EMPLOYEE", "ORGANIZATION_ADMIN"];

  const people = [
    orgUser(ME, "Me", "EMPLOYEE", "ORGANIZATION_ADMIN"),
    orgUser("u2", "Ana", "EMPLOYEE", "PROJECT_MANAGER"),
    orgUser("u3", "Bo", "EMPLOYEE"),
  ];

  it("shows only the columns the backend actually returns", () => {
    renderPeople(OA, organizationData(people));

    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Name", "Email", "Access roles", "Actions"]);
  });

  it("invents no field the user contract does not have", () => {
    // `GET /users` carries identity and roles. Anything else here would be blank
    // or made up. Asserted on the table rather than the page, because
    // "Department manager" is a legitimate role label in the filter.
    renderPeople(OA, organizationData(people));

    const table = screen.getByRole("table").textContent ?? "";
    for (const forbidden of [
      "Active",
      "Disabled",
      "Suspended",
      "Unassigned",
      "Last login",
      "Capacity",
      "Job title",
    ]) {
      expect(table).not.toContain(forbidden);
    }

    // And no column beyond the four the contract supports.
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).not.toContain("Department");
  });

  it("counts what was loaded, with no pagination implied", () => {
    renderPeople(OA, organizationData(people));

    expect(screen.getByText("3 people")).toBeInTheDocument();
    for (const control of ["Next", "Previous", "Load more", "Page 1"]) {
      expect(screen.queryByRole("button", { name: control })).toBeNull();
      expect(screen.queryByRole("link", { name: control })).toBeNull();
    }
  });

  it("filters locally, and says how many of how many", async () => {
    const user = userEvent.setup();
    renderPeople(OA, organizationData(people));

    await user.selectOptions(screen.getByLabelText("Show"), "PROJECT_MANAGER");

    expect(screen.getByText("1 of 3 people")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Ana" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Bo" })).toBeNull();
  });

  it("offers a way back from an empty filter", async () => {
    const user = userEvent.setup();
    renderPeople(OA, organizationData([orgUser("u3", "Bo", "EMPLOYEE")]));

    await user.selectOptions(screen.getByLabelText("Show"), "PROJECT_MANAGER");
    expect(screen.getByText("No people have the Project manager role.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByRole("link", { name: "Open Bo" })).toBeInTheDocument();
  });

  it("never offers System Admin as a filter", () => {
    renderPeople(OA, organizationData(people));

    const options = within(screen.getByLabelText("Show"))
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual([
      "All roles",
      "Employee",
      "Project manager",
      "Department manager",
      "Organization admin",
    ]);
    expect(options).not.toContain("System admin");
  });

  it("says so plainly when the founder is alone", () => {
    renderPeople(OA, organizationData([orgUser(ME, "Me", "EMPLOYEE", "ORGANIZATION_ADMIN")]));

    expect(screen.getByText("Only you so far.")).toBeInTheDocument();
    expect(screen.getByText(/invite link/)).toBeInTheDocument();
  });

  it("still lists the lone founder, because their own page is the only way to set up", () => {
    // Saying "only you so far" instead of listing them stranded the one person
    // allowed to edit their own roles with nothing linking to the screen for it.
    renderPeople(OA, organizationData([orgUser(ME, "Me", "EMPLOYEE", "ORGANIZATION_ADMIN")]));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Me" })).toHaveAttribute("href", `/people/${ME}`);
  });

  it("links each person to their own page", () => {
    renderPeople(OA, organizationData(people));

    expect(screen.getByRole("link", { name: "Open Ana" })).toHaveAttribute(
      "href",
      "/people/u2",
    );
  });
});

describe("department people", () => {
  const DM: readonly AccessRole[] = ["EMPLOYEE", "DEPARTMENT_MANAGER"];

  it("keeps members and the unassigned pool apart", () => {
    renderPeople(
      DM,
      departmentData(
        readyDepartment([deptUser("u1", "Ana", "EMPLOYEE")], [deptUser("u2", "Bo", "EMPLOYEE")]),
      ),
    );

    const members = screen.getByRole("region", { name: "Current members" });
    const unassigned = screen.getByRole("region", { name: "Unassigned employees" });

    expect(within(members).getByText("Ana")).toBeInTheDocument();
    expect(within(members).queryByText("Bo")).toBeNull();
    expect(within(unassigned).getByText("Bo")).toBeInTheDocument();
    expect(within(unassigned).queryByText("Ana")).toBeNull();
  });

  it("reads roles through the department contract's own field name", () => {
    // `accessRoles`, not `roles` — a shared shape would render nothing here.
    renderPeople(
      DM,
      departmentData(
        readyDepartment([deptUser("u1", "Ana", "EMPLOYEE", "PROJECT_MANAGER")], []),
      ),
    );

    const members = screen.getByRole("region", { name: "Current members" });
    expect(within(members).getByText("Project manager")).toBeInTheDocument();
  });

  it("adds rather than moves, and names the person", () => {
    renderPeople(DM, departmentData(readyDepartment([], [deptUser("u2", "Bo", "EMPLOYEE")])));

    expect(
      screen.getByRole("button", { name: "Add Bo to my department" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Move");
  });

  it("offers no department picker", () => {
    renderPeople(DM, departmentData(readyDepartment([], [deptUser("u2", "Bo", "EMPLOYEE")])));

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("offers no role editing to a department manager", () => {
    // Membership authority is not access-role authority.
    renderPeople(
      DM,
      departmentData(readyDepartment([deptUser("u1", "Ana", "EMPLOYEE")], [])),
    );

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save access roles/ })).toBeNull();
  });

  it("explains exactly what removing does, and does not", async () => {
    const user = userEvent.setup();
    renderPeople(
      DM,
      departmentData(readyDepartment([deptUser("u1", "Ana", "EMPLOYEE")], [])),
    );

    await user.click(
      screen.getByRole("button", { name: "Remove Ana from the department" }),
    );

    expect(
      screen.getByText("Remove Ana from Platform Engineering?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/department membership only/)).toBeInTheDocument();
    expect(screen.getByText(/does not delete their account/)).toBeInTheDocument();
    // Never claims anything about project allocations.
    expect(document.body.textContent).not.toMatch(/allocation|project/i);
  });

  it("tells a manager with no department what has to happen", () => {
    renderPeople(DM, departmentData({ kind: "no-department", reason: "FORBIDDEN" }));

    expect(screen.getByText("You are not managing a department yet.")).toBeInTheDocument();
    expect(screen.getByText(/must appoint you/)).toBeInTheDocument();
  });

  it("keeps an outage distinct from having no appointment", () => {
    renderPeople(DM, departmentData({ kind: "no-department", reason: "ERROR" }));

    expect(screen.getByText(/Could not load your department/)).toBeInTheDocument();
    expect(screen.queryByText("You are not managing a department yet.")).toBeNull();
  });

  it("keeps one pane when the other fails", () => {
    renderPeople(
      DM,
      departmentData({
        kind: "ready",
        department: { departmentId: "d1", name: "Platform Engineering" },
        members: { ok: true, value: [deptUser("u1", "Ana", "EMPLOYEE")] },
        unassigned: { ok: false, reason: "ERROR" },
      }),
    );

    expect(
      within(screen.getByRole("region", { name: "Current members" })).getByText("Ana"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Could not load unassigned employees/)).toBeInTheDocument();
  });
});
