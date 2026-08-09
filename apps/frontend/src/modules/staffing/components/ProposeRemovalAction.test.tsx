import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RemovalActionState } from "../model/reviewActionState";

import { ProposeRemovalAction } from "./ProposeRemovalAction";

/**
 * Asking for someone to come off a project.
 *
 * The whole point of the copy here is that nothing has happened yet: the person
 * stays on the project until their department manager decides.
 */

const action = vi.fn(
  async (_state: RemovalActionState, _formData: FormData): Promise<RemovalActionState> => ({
    fieldErrors: {},
  }),
);

vi.mock("../server/actions/removalActions", () => ({
  proposeDeallocationAction: (state: RemovalActionState, formData: FormData) =>
    action(state, formData),
}));

const PROJECT_ID = "p1";
const ALLOCATION_ID = "alloc-1";

function renderAction() {
  return render(
    <ProposeRemovalAction
      projectId={PROJECT_ID}
      allocationId={ALLOCATION_ID}
      employeeName="Elif Demir"
    />,
  );
}

function dialog(): HTMLDialogElement {
  const element = document.querySelector<HTMLDialogElement>("dialog");
  if (!element) throw new Error("expected a dialog");
  return element;
}

beforeEach(() => {
  action.mockClear();
  action.mockResolvedValue({ fieldErrors: {} });
});

describe("what it says it does", () => {
  it("proposes rather than removes", () => {
    renderAction();

    expect(screen.getByRole("button", { name: "Propose removal" })).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const forbidden of ["Remove now", "Delete member", "Remove from project"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("spells out that nobody moves yet", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));

    expect(screen.getByText(/does not remove the person immediately/)).toBeInTheDocument();
    expect(screen.getByText(/department manager must review/)).toBeInTheDocument();
    expect(screen.getByText(/stored permanently with the past allocation/)).toBeInTheDocument();
  });

  it("names the person being proposed", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));

    expect(screen.getByText("Propose removing Elif Demir?")).toBeInTheDocument();
  });
});

describe("the reason", () => {
  it("is required, and the submit stays off until there is one", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));

    const submit = screen.getAllByRole("button", { name: "Propose removal" })[1]!;
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/), "Scope reduced.");
    expect(submit).toBeEnabled();
  });

  it("is labelled as required and explains what it is for", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));

    expect(screen.getByText(/Required/)).toBeInTheDocument();
    expect(
      screen.getByText("Why this person should come off the project."),
    ).toBeInTheDocument();
  });

  it("links a server-side field error to the field", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({
      fieldErrors: { reason: "Say why this person should come off the project." },
    });
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));
    await user.type(screen.getByLabelText(/Reason/), "x");
    await user.click(screen.getAllByRole("button", { name: "Propose removal" })[1]!);

    const field = await screen.findByLabelText(/Reason/);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toBe(`removal-reason-${ALLOCATION_ID}-help`);
  });
});

describe("outcomes", () => {
  it("reports the request as sent, naming the reviewing department", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ fieldErrors: {}, sentTo: "Platform Engineering" });
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));
    await user.type(screen.getByLabelText(/Reason/), "Scope reduced.");
    await user.click(screen.getAllByRole("button", { name: "Propose removal" })[1]!);

    expect(
      await screen.findByText("Removal proposal sent to Platform Engineering for review."),
    ).toBeInTheDocument();
  });

  it("never claims the employee was removed", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ fieldErrors: {}, sentTo: "Platform Engineering" });
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));
    await user.type(screen.getByLabelText(/Reason/), "Scope reduced.");
    await user.click(screen.getAllByRole("button", { name: "Propose removal" })[1]!);

    await screen.findByText(/Removal proposal sent/);
    const text = document.body.textContent ?? "";
    for (const forbidden of ["Employee removed", "Allocation ended", "no longer on the project"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("keeps the dialog and shows the reason when the backend refuses", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({
      fieldErrors: {},
      formError: "A pending deallocation proposal already exists for this allocation.",
    });
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));
    await user.type(screen.getByLabelText(/Reason/), "Scope reduced.");
    await user.click(screen.getAllByRole("button", { name: "Propose removal" })[1]!);

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.queryByText(/Removal proposal sent/)).toBeNull();
  });
});

describe("what is sent", () => {
  it("carries the identifiers as values, never a path", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));
    await user.type(screen.getByLabelText(/Reason/), "Scope reduced.");
    await user.click(screen.getAllByRole("button", { name: "Propose removal" })[1]!);

    const formData = action.mock.calls[0]![1];
    expect(formData.get("projectId")).toBe(PROJECT_ID);
    expect(formData.get("allocationId")).toBe(ALLOCATION_ID);
    expect(formData.get("reason")).toBe("Scope reduced.");
    // Nothing the backend does not accept.
    for (const forbidden of ["employeeId", "departmentId", "proposedBy"]) {
      expect(formData.get(forbidden)).toBeNull();
    }
  });
});

describe("the dialog", () => {
  it("opens only when asked", () => {
    renderAction();

    expect(dialog().open).toBe(false);
  });

  it("can be dismissed without sending anything", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Propose removal" }));
    expect(dialog().open).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog().open).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
