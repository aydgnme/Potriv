import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignOutEverywhere } from "./SignOutEverywhere";

/**
 * The real interaction, not a static render.
 *
 * The invariant this file exists for: **once local cookies are cleared, the
 * browser must not stay on a protected page.** An Account screen rendered before
 * the mutation and left in place afterwards would be a protected surface
 * presenting itself as live to a session that no longer exists.
 *
 * Both outcomes leave. Only the message differs.
 */

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom does not implement <dialog>.
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false;
  });
});

function respond(revokedEverywhere: boolean, ok = true) {
  fetchMock.mockResolvedValue({
    ok,
    json: async () => ({ authenticated: false, revokedEverywhere }),
  });
}

async function confirmSignOutEverywhere() {
  const user = userEvent.setup();
  render(<SignOutEverywhere />);

  await user.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  const confirm = screen
    .getAllByRole("button", { name: "Sign out everywhere" })
    .at(-1) as HTMLElement;
  await user.click(confirm);
  return user;
}

describe("confirmation", () => {
  it("asks before doing anything, naming the consequence", async () => {
    const user = userEvent.setup();
    render(<SignOutEverywhere />);

    await user.click(screen.getByRole("button", { name: "Sign out everywhere" }));

    expect(
      screen.getByText("Every session, including this one, will be signed out."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels without mutating anything", async () => {
    const user = userEvent.setup();
    render(<SignOutEverywhere />);

    await user.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("remote success", () => {
  it("leaves the protected route for login", async () => {
    respond(true);
    await confirmSignOutEverywhere();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    // No caveat: the backend confirmed the revocation.
    expect(replace).not.toHaveBeenCalledWith("/login?logout=local-only");
  });

  it("issues exactly one mutation for one user action", async () => {
    respond(true);
    await confirmSignOutEverywhere();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout-all", { method: "POST" });
  });
});

describe("remote failure", () => {
  it("still leaves the protected route, carrying the caveat to login", async () => {
    respond(false);
    await confirmSignOutEverywhere();

    // The cookies are gone either way, so staying would leave a dead page
    // looking authenticated.
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?logout=local-only"),
    );
  });

  it("never claims every session was signed out", async () => {
    respond(false);
    await confirmSignOutEverywhere();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const text = (document.body.textContent ?? "").toLowerCase();
    expect(text).not.toContain("all sessions");
    expect(text).not.toContain("everywhere signed out");
  });

  it("does not retry the mutation", async () => {
    respond(false);
    await confirmSignOutEverywhere();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    // Replaying could revoke a session somebody has since signed back into.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a network failure the same way — leave, with the caveat", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await confirmSignOutEverywhere();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?logout=local-only"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a non-ok response as unconfirmed rather than successful", async () => {
    respond(true, false);
    await confirmSignOutEverywhere();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?logout=local-only"),
    );
  });
});
