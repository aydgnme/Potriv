import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";


import { Button } from "./Button";

/**
 * Keyboard activation, proven with real key input.
 *
 * V2-09 originally claimed `userEvent` proved Enter/Space activation, implicit
 * submit, cancel and focus return **before any such test existed** — the suite
 * was green on `user.click`, which proves pointer activation and nothing about a
 * keyboard. These tests exist so that claim is backed by the thing it describes,
 * and so the parts that remain unproven are named rather than implied.
 *
 * Everything here goes through `user.keyboard(...)`. No `click`, no
 * `fireEvent.click`, no direct callback invocation, no `requestSubmit()`.
 *
 * The first block measures what this environment actually performs, so the
 * product assertions below rest on a recorded capability rather than an
 * assumption about jsdom.
 *
 * Keyboard evidence for a real Potriv dialog lives beside the component it
 * covers, in `modules/account/components/SignOutEverywhere.test.tsx` — `shared`
 * may not import `modules`, and the mobile navigation sheet that lives here is
 * `display: none` at jsdom's default width, so focusing it would prove nothing.
 */

describe("what userEvent performs in this environment", () => {
  it("performs Enter activation on a native button", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<button type="button" onClick={onClick}>Probe</button>);

    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("performs Space activation on a native button", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<button type="button" onClick={onClick}>Probe</button>);

    screen.getByRole("button").focus();
    await user.keyboard("[Space]");

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("the shared Button responds to a keyboard", () => {
  it("activates on Enter", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save changes</Button>);

    screen.getByRole("button", { name: "Save changes" }).focus();
    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates on Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save changes</Button>);

    screen.getByRole("button", { name: "Save changes" }).focus();
    await user.keyboard("[Space]");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cannot be activated by a keyboard while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick} loading>Save changes</Button>);

    screen.getByRole("button", { name: "Save changes" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("[Space]");

    // The pending state has to stop a second submission from the keyboard too,
    // not only from a pointer — otherwise holding Enter duplicates a mutation.
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is reachable by Tab and skipped when disabled", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>First</Button>
        <Button disabled>Unavailable</Button>
        <Button>Last</Button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();

    await user.tab();
    // A disabled control is not a tab stop, so focus lands on the next one.
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });
});

describe("implicit form submission from the keyboard", () => {
  it("submits from a text field on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" />
        <Button type="submit">Save</Button>
      </form>,
    );

    // Focus is taken by typing into the field, not by clicking it.
    screen.getByLabelText("Name").focus();
    await user.keyboard("Platform{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits when the submit control itself is focused and Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="n2">Name</label>
        <input id="n2" name="n2" />
        <Button type="submit">Save</Button>
      </form>,
    );

    screen.getByRole("button", { name: "Save" }).focus();
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
