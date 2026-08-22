import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { FormErrorSummary } from "./FormErrorSummary";
import { Input } from "./Input";
import { Select } from "./Select";
import { Textarea } from "./Textarea";

/**
 * The announcement contract, and the defect it exists for.
 *
 * V2-09 shipped field errors that were visible, `aria-invalid`, and associated
 * through `aria-describedby` — and announced to nobody. `aria-describedby` is
 * read when focus reaches the control; it is not a status message, so somebody
 * who submitted a form and was waiting on it heard silence. That is WCAG 4.1.3.
 *
 * What is asserted here is that the message lands inside a `role="alert"`
 * region. That is the DOM contract a screen reader acts on, and it is what these
 * tests can honestly prove — they are not a screen-reader product matrix, and
 * nothing here claims one.
 */

/** One field of each shared kind, plus the single summary that announces. */
function Harness({ errors, hint }: { errors: Record<string, string>; hint?: boolean }) {
  return (
    <form>
      <FormErrorSummary
        fieldErrors={errors}
        labels={{ name: "Name", notes: "Notes", period: "Period" }}
        order={["name", "notes", "period"]}
      />
      <Input label="Name" name="name" error={errors.name} hint={hint ? "Your full name." : undefined} />
      <Textarea label="Notes" name="notes" error={errors.notes} />
      <Select label="Period" name="period" error={errors.period}>
        <option value="">Choose</option>
        <option value="FIXED">Fixed</option>
      </Select>
    </form>
  );
}

const describedByText = (control: HTMLElement) =>
  (control.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const node = document.getElementById(id);
      if (!node) throw new Error(`aria-describedby points at missing id "${id}"`);
      return node.textContent?.trim() ?? "";
    });

describe("a field error is linked to its control", () => {
  it.each([
    ["Name", "name", "Enter your name."],
    ["Notes", "notes", "Notes are too long."],
    ["Period", "period", "Choose a period."],
  ])("marks %s invalid and resolves its description", (label, field, message) => {
    render(<Harness errors={{ [field]: message }} />);
    const control = screen.getByLabelText(label);

    expect(control).toHaveAttribute("aria-invalid", "true");
    // Resolving is the point: an aria-describedby that names a missing id is
    // worse than none, because it looks associated and describes nothing.
    expect(describedByText(control)).toContain(message);
  });

  it("keeps a hint and an error together, both resolving", () => {
    render(<Harness errors={{ name: "Enter your name." }} hint />);

    expect(describedByText(screen.getByLabelText("Name"))).toEqual([
      "Your full name.",
      "Enter your name.",
    ]);
  });

  it("drops the invalid state when the error is cleared", () => {
    const { rerender } = render(<Harness errors={{ name: "Enter your name." }} />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");

    rerender(<Harness errors={{}} />);
    const control = screen.getByLabelText("Name");
    expect(control).not.toHaveAttribute("aria-invalid");
    expect(control).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a failed submission is announced once", () => {
  it("puts every field message inside one alert", () => {
    render(
      <Harness
        errors={{
          name: "Enter your name.",
          notes: "Notes are too long.",
          period: "Choose a period.",
        }}
      />,
    );

    // One region, not three competing assertive ones.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);

    const alert = within(alerts[0]);
    expect(alert.getByText("Name: Enter your name.")).toBeInTheDocument();
    expect(alert.getByText("Notes: Notes are too long.")).toBeInTheDocument();
    expect(alert.getByText("Period: Choose a period.")).toBeInTheDocument();
    expect(alerts[0]).toHaveTextContent("Check 3 fields");
  });

  it("names the field, because the message alone can be useless", () => {
    render(<Harness errors={{ name: "Required." }} />);

    // "Required." announced on its own says nothing about what is required.
    expect(within(screen.getByRole("alert")).getByText("Name: Required.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Check one field");
  });

  it("says nothing at all when the form is valid", () => {
    render(<Harness errors={{}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not make the field's own message live", () => {
    render(<Harness errors={{ name: "Enter your name." }} />);

    // The visible message beside the field stays put and stays silent; if it
    // were live too, one failure would be announced twice.
    const beside = document.querySelector("[id$='-error']");
    expect(beside).toHaveTextContent("Enter your name.");
    expect(beside?.closest("[role=alert]")).toBeNull();
    expect(beside).not.toHaveAttribute("aria-live");
  });
});

describe("a form-level failure and field errors share one region", () => {
  it("merges both rather than letting one hide the other", () => {
    render(
      <FormErrorSummary
        formError="Team roles could not be loaded, so the project was not created."
        title="This was not saved"
        fieldErrors={{ name: "Enter a name." }}
        labels={{ name: "Project name" }}
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("This was not saved");
    expect(alerts[0]).toHaveTextContent("Team roles could not be loaded");
    expect(alerts[0]).toHaveTextContent("Project name: Enter a name.");
  });

  it("keeps a form-level message wordless of any heading it did not have", () => {
    // The login failure is deliberately generic and deliberately untitled.
    render(<FormErrorSummary formError="Invalid email or password." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password.");
    expect(alert).not.toHaveTextContent("Check");
  });
});

describe("the summary orders messages the way the form reads", () => {
  it("follows the given order, not the object's key order", () => {
    render(
      <FormErrorSummary
        fieldErrors={{ period: "Choose a period.", name: "Enter your name." }}
        labels={{ name: "Name", period: "Period" }}
        order={["name", "period"]}
      />,
    );

    const items = within(screen.getByRole("alert"))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["Name: Enter your name.", "Period: Choose a period."]);
  });
});

describe("correcting a field from the keyboard", () => {
  function Live() {
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | undefined>(undefined);
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(value.trim() ? undefined : "Enter your name.");
        }}
      >
        <FormErrorSummary fieldErrors={{ name: error }} labels={{ name: "Name" }} />
        <Input label="Name" name="name" value={value} error={error} onChange={(e) => setValue(e.target.value)} />
        <button type="submit">Save</button>
      </form>
    );
  }

  it("announces on failure and clears the announcement once fixed", async () => {
    const user = userEvent.setup();
    render(<Live />);

    screen.getByRole("button", { name: "Save" }).focus();
    await user.keyboard("{Enter}");

    expect(within(screen.getByRole("alert")).getByText("Name: Enter your name.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByLabelText("Name"));
    await user.keyboard("Mert{Enter}");

    // Stale feedback does not survive a submission that succeeded.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });
});
