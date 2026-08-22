import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MembershipActionState } from "../model/peopleActionState";
import type { DepartmentUser } from "../model/peopleData";
import type { DepartmentData } from "../server/loadPeople";

import { DepartmentPeople } from "./DepartmentPeople";

/**
 * Adding and removing department members, and hearing whether it worked.
 *
 * Both controls returned their failure into a plain `<span>`. The action ran,
 * the request failed, and a screen reader said nothing — on a screen where the
 * failure is the only thing distinguishing "not added" from "added".
 */

const add = vi.fn<(s: MembershipActionState, f: FormData) => Promise<MembershipActionState>>(
  async () => ({}),
);
const remove = vi.fn<(s: MembershipActionState, f: FormData) => Promise<MembershipActionState>>(
  async () => ({}),
);

vi.mock("../server/actions/membershipActions", () => ({
  addDepartmentMemberAction: (s: MembershipActionState, f: FormData) => add(s, f),
  removeDepartmentMemberAction: (s: MembershipActionState, f: FormData) => remove(s, f),
}));

const MEMBER: DepartmentUser = {
  userId: "u-member",
  name: "Rana Duman",
  email: "rana@example.com",
  accessRoles: ["EMPLOYEE"],
};
const OUTSIDER: DepartmentUser = {
  userId: "u-outsider",
  name: "Kerem Yildiz",
  email: "kerem@example.com",
  accessRoles: ["EMPLOYEE"],
};

const READY: DepartmentData = {
  kind: "ready",
  department: { departmentId: "d1", name: "Platform" },
  members: { ok: true, value: [MEMBER] },
  unassigned: { ok: true, value: [OUTSIDER] },
};

beforeEach(() => {
  add.mockReset();
  add.mockResolvedValue({});
  remove.mockReset();
  remove.mockResolvedValue({});
});

/** Presses a control with the keyboard only. */
async function press(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const button = screen.getByRole("button", { name });
  button.focus();
  await user.keyboard("{Enter}");
}

describe("adding a member reports its own failure", () => {
  it("announces the failure exactly once", async () => {
    add.mockResolvedValue({ error: "Kerem is already in another department." });
    const user = userEvent.setup();
    render(<DepartmentPeople data={READY} />);

    await press(user, /^Add Kerem Yildiz/);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Kerem is already in another department.");
  });

  it("does not announce anything on the remove control's row", async () => {
    add.mockResolvedValue({ error: "Kerem is already in another department." });
    const user = userEvent.setup();
    render(<DepartmentPeople data={READY} />);

    await press(user, /^Add Kerem Yildiz/);
    await screen.findByRole("alert");

    // Each control owns its own result; one failing must not mark the other.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("removing a member reports its own failure", () => {
  /**
   * Removal is behind a confirmation dialog. Opening it and confirming are both
   * done from the keyboard; what is *not* claimed here is Escape-to-close or
   * focus return, which are native `<dialog>` defaults jsdom does not implement.
   * See the V2-09 document — those remain environment-owned and unproven.
   */
  it("announces the failure exactly once, after confirming", async () => {
    remove.mockResolvedValue({ error: "Rana could not be removed." });
    const user = userEvent.setup();
    render(<DepartmentPeople data={READY} />);

    await press(user, /^Remove Rana Duman/);
    // The confirm control inside the dialog.
    const confirm = screen
      .getAllByRole("button", { name: /remove/i })
      .find((button) => button.closest("dialog"));
    expect(confirm).toBeDefined();
    (confirm as HTMLElement).focus();
    await user.keyboard("{Enter}");

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Rana could not be removed.");
  });
});

describe("nothing is announced before an action runs", () => {
  it("has no live region on first render", () => {
    render(<DepartmentPeople data={READY} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
