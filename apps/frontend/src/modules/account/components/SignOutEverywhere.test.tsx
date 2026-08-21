import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignOutEverywhere } from "./SignOutEverywhere";

/**
 * The real interaction, not a static render.
 *
 * Two invariants pull against each other, and both matter.
 *
 * **Once local cookies are cleared, the browser must not stay on a protected
 * page** — an Account screen left in place would present itself as live to a
 * session that no longer exists.
 *
 * **But "cleared" has to be established, not assumed.** A response is the
 * evidence that the BFF ran; without one, the route may never have executed and
 * the cookies may still be there. So there are three destinations, not two.
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

describe("confirmed local-only sign-out", () => {
  it("goes to login with the caveat when the BFF ran but the backend did not confirm", async () => {
    respond(false);
    await confirmSignOutEverywhere();

    // The response is the evidence that the BFF executed and cleared cookies.
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
  });
});

/**
 * The case that was previously collapsed into "local-only".
 *
 * A rejected `fetch` proves nothing: the route may never have run, so the
 * cookies may still be there. And `/login` redirects an authenticated session
 * straight to `/home` — so claiming local sign-out here would bounce somebody
 * back into the product having told them they were signed out.
 *
 * The browser therefore returns to Account, where the server decides.
 */
describe("unconfirmed transport outcome", () => {
  it("does not claim local sign-out when the request never completed", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await confirmSignOutEverywhere();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/account?logout=unconfirmed"),
    );
    expect(replace).not.toHaveBeenCalledWith("/login?logout=local-only");
    expect(replace).not.toHaveBeenCalledWith("/login");
  });

  it("treats a non-ok response as unconfirmed", async () => {
    respond(true, false);
    await confirmSignOutEverywhere();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/account?logout=unconfirmed"),
    );
    expect(replace).not.toHaveBeenCalledWith("/login?logout=local-only");
  });

  it("treats an unreadable body as unconfirmed", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    });
    await confirmSignOutEverywhere();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/account?logout=unconfirmed"),
    );
  });

  it("treats a body without authenticated:false as unconfirmed", async () => {
    // `revokedEverywhere: false` alone is not the BFF saying it signed this
    // browser out — it could be any other response shape.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ revokedEverywhere: false }),
    });
    await confirmSignOutEverywhere();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/account?logout=unconfirmed"),
    );
    expect(replace).not.toHaveBeenCalledWith("/login?logout=local-only");
  });

  it("still issues exactly one mutation and never retries", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await confirmSignOutEverywhere();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
