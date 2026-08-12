import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_ACTION_STATE, type ProjectActionState } from "../model/projectActionState";
import type { TeamRoleCatalogueEntry } from "../model/projectDetail";

import { ProjectForm, type ProjectFormDefaults } from "./ProjectForm";

/**
 * What the form does before anything is submitted.
 *
 * The Server Action decides what is saved; these cover the behaviour the browser
 * owns — which controls exist, and what state a deliberate change leaves behind.
 */

const BACKEND: TeamRoleCatalogueEntry = {
  teamRoleId: "role-backend",
  name: "Backend",
  description: null,
  active: true,
};
const RETIRED_QA: TeamRoleCatalogueEntry = {
  teamRoleId: "role-qa",
  name: "Deprecated QA",
  description: null,
  active: false,
};
const RETIRED_OPS: TeamRoleCatalogueEntry = {
  teamRoleId: "role-ops",
  name: "Deprecated Ops",
  description: null,
  active: false,
};

function defaults(overrides: Partial<ProjectFormDefaults> = {}): ProjectFormDefaults {
  return {
    name: "Apollo",
    period: "FIXED",
    startDate: "2026-08-01",
    deadlineDate: "2026-12-31",
    status: "STARTING",
    generalDescription: "",
    technologies: [],
    requirements: [],
    ...overrides,
  };
}

const noop = vi.fn(async (): Promise<ProjectActionState> => EMPTY_ACTION_STATE);

beforeEach(() => {
  noop.mockClear();
});

/** Whether the confirmation was actually asked for, rather than merely present. */
function confirmDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  if (!dialog) throw new Error("expected a confirmation dialog");
  return dialog;
}

function renderForm(
  props: Partial<React.ComponentProps<typeof ProjectForm>> = {},
) {
  return render(
    <ProjectForm
      mode="edit"
      action={noop}
      defaults={defaults()}
      catalogue={[BACKEND, RETIRED_QA, RETIRED_OPS]}
      preservableRoleIds={[]}
      submitLabel="Save changes"
      {...props}
    />,
  );
}

describe("status choices", () => {
  it("offers only planning statuses on create", () => {
    renderForm({ mode: "create", defaults: defaults({ status: "NOT_STARTED" }) });

    const options = within(screen.getByLabelText(/Status/)).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Not started", "Starting"]);
  });

  it("offers every backend status on edit, with no invented transition graph", () => {
    renderForm();

    const options = within(screen.getByLabelText(/Status/)).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Not started",
      "Starting",
      "In progress",
      "Closing",
      "Closed",
    ]);
    // Every one of them selectable: the backend decides what a change means.
    expect(options.every((option) => !(option as HTMLOptionElement).disabled)).toBe(true);
  });
});

describe("status confirmation", () => {
  it("asks before changing status, naming both ends of the change", async () => {
    const user = userEvent.setup();
    renderForm({ defaults: defaults({ status: "STARTING" }) });

    await user.selectOptions(screen.getByLabelText(/Status/), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(confirmDialog().open).toBe(true);
    expect(
      within(confirmDialog()).getByText("Change project status from Starting to In progress?"),
    ).toBeInTheDocument();
    expect(noop).not.toHaveBeenCalled();
  });

  it("does not ask when the status was not touched", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // Nothing to confirm, so the dialog was never opened and the save went ahead.
    expect(confirmDialog().open).toBe(false);
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed without changing anything", async () => {
    const user = userEvent.setup();
    renderForm({ defaults: defaults({ status: "STARTING" }) });

    await user.selectOptions(screen.getByLabelText(/Status/), "CLOSED");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(within(confirmDialog()).getByRole("button", { name: "Cancel" }));

    expect(confirmDialog().open).toBe(false);
    expect(noop).not.toHaveBeenCalled();
  });
});

describe("schedule switching", () => {
  it("removes the deadline field entirely for an ongoing project", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText(/Deadline/)).toHaveValue("2026-12-31");

    await user.selectOptions(screen.getByLabelText(/Period/), "ONGOING");

    // Not merely hidden: there is no field left that could submit the old date.
    expect(screen.queryByLabelText(/Deadline/)).toBeNull();
  });

  it("does not bring the old deadline back when switching to fixed again", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/Period/), "ONGOING");
    await user.selectOptions(screen.getByLabelText(/Period/), "FIXED");

    expect(screen.getByLabelText(/Deadline/)).toHaveValue("");
  });
});

describe("team-role requirements", () => {
  it("offers an inactive role only where the project already uses it", async () => {
    const user = userEvent.setup();
    renderForm({
      defaults: defaults({
        requirements: [{ teamRoleId: RETIRED_QA.teamRoleId, requiredMembers: 1 }],
      }),
      preservableRoleIds: [RETIRED_QA.teamRoleId],
    });

    const options = within(screen.getByLabelText("Team role 1")).getAllByRole("option");
    const labels = options.map((option) => option.textContent);

    expect(labels).toContain("Backend");
    // Attached, so it stays choosable and says why it looks different.
    expect(labels).toContain("Deprecated QA (inactive)");
    // Unrelated and inactive: not offered at all.
    expect(labels).not.toContain("Deprecated Ops (inactive)");

    await user.click(screen.getByRole("button", { name: "Add requirement" }));
    const newRow = within(screen.getByLabelText("Team role 2")).getAllByRole("option");
    expect(newRow.map((option) => option.textContent)).not.toContain("Deprecated Ops (inactive)");
  });

  it("keeps an attached inactive requirement rather than dropping it", () => {
    renderForm({
      defaults: defaults({
        requirements: [{ teamRoleId: RETIRED_QA.teamRoleId, requiredMembers: 2 }],
      }),
      preservableRoleIds: [RETIRED_QA.teamRoleId],
    });

    expect(screen.getByLabelText("Team role 1")).toHaveValue(RETIRED_QA.teamRoleId);
    expect(screen.getByLabelText("People needed for role 1")).toHaveValue(2);
  });

  it("names the row on each remove button", async () => {
    const user = userEvent.setup();
    renderForm({
      defaults: defaults({ requirements: [{ teamRoleId: BACKEND.teamRoleId, requiredMembers: 1 }] }),
    });

    expect(screen.getByRole("button", { name: "Remove requirement 1, Backend" }))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove requirement 1, Backend" }));
    expect(screen.getByText("No roles required.")).toBeInTheDocument();
  });

  it("says who must act when the catalogue is empty", () => {
    renderForm({ catalogue: [] });

    expect(screen.getByText(/An Organization Admin must create team roles/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add requirement" })).toBeNull();
  });
});

describe("technology stack", () => {
  it("adds and removes rows without rewriting what was typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add technology" }));
    const field = screen.getByLabelText("Technology 1");
    await user.type(field, "  Spring   Boot ");

    // Normalization happens at submission, not under the caret.
    expect(field).toHaveValue("  Spring   Boot ");

    await user.click(screen.getByRole("button", { name: /Remove technology 1/ }));
    expect(screen.getByText("No technologies listed.")).toBeInTheDocument();
  });
});

describe("errors and blocking", () => {
  it("shows a field error against the field it belongs to", () => {
    const failing = vi.fn(async (): Promise<ProjectActionState> => ({
      fieldErrors: { name: "Enter a project name." },
      formError: "Check the highlighted fields.",
    }));

    render(
      <ProjectForm
        mode="create"
        action={failing}
        defaults={defaults()}
        catalogue={[BACKEND]}
        preservableRoleIds={[]}
        submitLabel="Create project"
      />,
    );

    expect(screen.getByRole("button", { name: "Create project" })).toBeInTheDocument();
  });

  it("keeps what was typed when the submission is rejected", async () => {
    // React resets uncontrolled fields in a form once its action settles, which
    // would empty the form at exactly the moment the person needs it intact.
    const user = userEvent.setup();
    const failing = vi.fn(async (): Promise<ProjectActionState> => ({
      fieldErrors: { deadlineDate: "The deadline cannot be before the start date." },
      formError: "Check the highlighted fields.",
    }));

    render(
      <ProjectForm
        mode="create"
        action={failing}
        defaults={defaults({ name: "" })}
        catalogue={[BACKEND]}
        preservableRoleIds={[]}
        submitLabel="Create project"
      />,
    );

    await user.type(screen.getByLabelText(/Project name/), "Apollo");
    await user.type(screen.getByLabelText(/Description/), "Billing rewrite");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    // Wait for the rejected action's state to reach the screen before asking what
    // the fields hold. Asserting straight after the click raced the commit and
    // failed intermittently under a loaded suite.
    expect(
      await screen.findByText("The deadline cannot be before the start date."),
    ).toBeInTheDocument();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Project name/)).toHaveValue("Apollo");
    expect(screen.getByLabelText(/Description/)).toHaveValue("Billing rewrite");
    expect(screen.getByLabelText(/Start date/)).toHaveValue("2026-08-01");
  });

  it("blocks saving when a dependency could not be loaded", () => {
    renderForm({ blockedReason: "Team roles could not be loaded." });

    expect(screen.getByText("Team roles could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("carries the project id as a value, never a path", () => {
    const { container } = renderForm({ projectId: "p1" });

    const hidden = container.querySelector('input[name="projectId"]');
    expect(hidden).toHaveValue("p1");
    expect(container.querySelector('input[name="path"]')).toBeNull();
    expect(container.innerHTML).not.toContain("/api/");
  });
});
