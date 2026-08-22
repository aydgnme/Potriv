import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionActionState } from "../model/accountActionState";
import type { AccountSession } from "../model/sessionList";

import { SessionTable } from "./SessionTable";

/**
 * Revoking a session, and being told whether it worked.
 *
 * Ending a session on another device is exactly the kind of action somebody
 * needs confirmed. Before this pass the result was a plain `<span>`: visible,
 * and announced to nobody, so a person using a screen reader could revoke a
 * session and hear nothing at all about the outcome.
 */

const revoke = vi.fn<
  (state: SessionActionState, formData: FormData) => Promise<SessionActionState>
>(async () => ({}));

vi.mock("../server/actions/sessionActions", () => ({
  revokeSessionAction: (state: SessionActionState, formData: FormData) =>
    revoke(state, formData),
}));

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    sessionId: "s1",
    createdAt: "2026-08-01T09:00:00Z",
    lastSeenAt: "2026-08-20T17:30:00Z",
    revokedAt: null,
    userAgent: "Firefox on macOS",
    ipAddress: "203.0.113.7",
    currentSession: false,
    ...overrides,
  };
}

function renderTable(sessions: readonly AccountSession[] = [session()]) {
  return render(
    <SessionTable
      sessions={sessions}
      heading="Other sessions"
      headingId="other-sessions"
      caption="Sessions signed in on other devices"
    />,
  );
}

/** Submits the row's revoke form with the keyboard alone. */
async function revokeFromKeyboard(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole("button", { name: /^Revoke session/ });
  button.focus();
  await user.keyboard("{Enter}");
}

beforeEach(() => {
  revoke.mockReset();
  revoke.mockResolvedValue({});
});

describe("the result of revoking is announced", () => {
  it("announces a failure in one alert", async () => {
    revoke.mockResolvedValue({ error: "That session could not be ended." });
    const user = userEvent.setup();
    renderTable();

    await revokeFromKeyboard(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That session could not be ended.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces a success in one status region", async () => {
    revoke.mockResolvedValue({ done: "Session ended." });
    const user = userEvent.setup();
    renderTable();

    await revokeFromKeyboard(user);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Session ended.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the wording exactly as the action returned it", async () => {
    revoke.mockResolvedValue({ error: "That session could not be ended." });
    const user = userEvent.setup();
    renderTable();

    await revokeFromKeyboard(user);

    // No heading, prefix or decoration added around the message.
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That session could not be ended.",
    );
  });

  it("adds no tab stop", async () => {
    revoke.mockResolvedValue({ error: "That session could not be ended." });
    const user = userEvent.setup();
    renderTable();

    await revokeFromKeyboard(user);
    await screen.findByRole("alert");

    // From the revoke button, Tab must not land on the feedback.
    screen.getByRole("button", { name: /^Revoke session/ }).focus();
    await user.tab();
    expect(document.activeElement).not.toBe(screen.getByRole("alert"));
    expect(screen.getByRole("alert")).not.toHaveAttribute("tabindex");
  });

  it("keeps the row's table semantics", async () => {
    revoke.mockResolvedValue({ done: "Session ended." });
    const user = userEvent.setup();
    renderTable();

    await revokeFromKeyboard(user);
    const status = await screen.findByRole("status");

    // Inline inside the row header cell, so the row is still a row.
    expect(status.tagName).toBe("SPAN");
    expect(status.closest("th")).not.toBeNull();
    expect(within(screen.getByRole("table")).getAllByRole("rowheader")).toHaveLength(1);
  });

  it("says nothing before the action has run", () => {
    renderTable();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
