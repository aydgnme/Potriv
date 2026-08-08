import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("renders a real button with an accessible name", () => {
    render(<Button variant="primary">Send proposal</Button>);

    expect(screen.getByRole("button", { name: "Send proposal" })).toBeInTheDocument();
  });

  it("defaults to type=button so it cannot submit a form by accident", () => {
    render(<Button>Cancel</Button>);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("type", "button");
  });

  it("does not fire its handler while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Accept
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Accept" });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("blocks a second press while loading and announces the busy state", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Accept
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Accept" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its label visible while loading, so it cannot change width mid-action", () => {
    render(<Button loading>Send proposal</Button>);

    expect(screen.getByRole("button", { name: "Send proposal" })).toBeInTheDocument();
  });
});
