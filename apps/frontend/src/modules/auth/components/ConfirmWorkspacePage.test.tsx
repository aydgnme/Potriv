import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmWorkspacePage } from "./ConfirmWorkspacePage";

/**
 * Confirming a workspace registration from an emailed link.
 *
 * The confirmation token is what actually creates the organization and the
 * administrator account, so it carries the same handling `ResetPasswordPage`
 * gives its own token: it arrives in the fragment, it leaves the address bar
 * as soon as it has been read, and it is still spendable afterwards — because
 * a "safer" version that loses the token would just be broken.
 */

const TOKEN = "registration-token-value-abc123";

function withTokenInFragment(token: string) {
  window.history.replaceState(
    {}, "", token ? `/create-workspace/verify#token=${token}` : "/create-workspace/verify",
  );
}

function mockFetch(ok = true, body: unknown = { organizationId: "org-1", userId: "user-1" }) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 201 : 400,
    // The message a real BFF response carries for this code — see
    // REGISTER_TOKEN_INVALID_MESSAGE — since the client renders it verbatim
    // rather than re-deriving it from the code.
    json: async () => (ok ? body : {
      error: {
        code: "REGISTER_TOKEN_INVALID",
        message: "This confirmation link is no longer valid. Start over to create your workspace.",
      },
    }),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.clearAllMocks();
  withTokenInFragment(TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading the token", () => {
  it("accepts a token from the fragment", () => {
    render(<ConfirmWorkspacePage />);

    expect(screen.getByRole("button", { name: /confirm and create workspace/i }))
      .toBeInTheDocument();
  });

  it("treats a missing token as a dead link", () => {
    withTokenInFragment("");
    render(<ConfirmWorkspacePage />);

    expect(screen.queryByRole("button", { name: /confirm and create workspace/i })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/no longer valid/i);
  });

  it("ignores a token in the query string", () => {
    // The old form. Accepting it would keep alive the shape that put the
    // token into every access log between the reader and this page.
    window.history.replaceState({}, "", `/create-workspace/verify?token=${TOKEN}`);
    render(<ConfirmWorkspacePage />);

    expect(screen.queryByRole("button", { name: /confirm and create workspace/i })).toBeNull();
  });

  it("removes it from the address bar once read", () => {
    render(<ConfirmWorkspacePage />);

    expect(screen.getByRole("button", { name: /confirm and create workspace/i }))
      .toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
  });
});

describe("what the page does with it", () => {
  it("never renders it", () => {
    const { container } = render(<ConfirmWorkspacePage />);

    expect(container.textContent).not.toContain(TOKEN);
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("still sends it after the address bar has been cleared, in the body", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(<ConfirmWorkspacePage />);
    await user.click(screen.getByRole("button", { name: /confirm and create workspace/i }));

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toContain(TOKEN);
    expect(String(url)).not.toContain("token=");
    expect(JSON.parse(String(init.body)).token).toBe(TOKEN);
  });

  it("posts to the BFF boundary, never to the backend directly", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(<ConfirmWorkspacePage />);
    await user.click(screen.getByRole("button", { name: /confirm and create workspace/i }));

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/register-workspace/verify");
    expect(url).not.toMatch(/^https?:\/\//);
  });
});

describe("on success", () => {
  it("reports the workspace as ready and does not claim a session", async () => {
    mockFetch();
    const user = userEvent.setup();

    render(<ConfirmWorkspacePage />);
    await user.click(screen.getByRole("button", { name: /confirm and create workspace/i }));

    expect(await screen.findByRole("heading", { name: /workspace is ready/i }))
      .toBeInTheDocument();
    const next = screen.getByRole("link", { name: /sign in/i });
    expect(next).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /go to (home|dashboard)/i })).toBeNull();
  });
});

describe("on rejection", () => {
  it("shows one generic message for every dead token, without a heading change", async () => {
    mockFetch(false);
    const user = userEvent.setup();

    render(<ConfirmWorkspacePage />);
    await user.click(screen.getByRole("button", { name: /confirm and create workspace/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i);
    expect(screen.queryByRole("heading", { name: /workspace is ready/i })).toBeNull();
    // Still on the confirm action, not stuck in a loading state.
    expect(screen.getByRole("button", { name: /confirm and create workspace/i }))
      .toBeInTheDocument();
  });
});
