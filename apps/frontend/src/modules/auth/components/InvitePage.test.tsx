import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitePage } from "./InvitePage";

/**
 * Joining a workspace by invitation.
 *
 * Three things this page must not do, and every test here defends one of them:
 * show or persist the invite token, say which kind of invalid an invite is, or
 * imply the new employee is signed in when the backend issued no session.
 */

const TOKEN = "invite-token-value-abc123";

/**
 * The token reaches the component the way it reaches it in production: from the
 * address bar. It is deliberately not a prop — a prop on a client component is
 * serialised into the RSC payload and would put the token in the HTML as well
 * as the URL — so the tests must set the URL, not pass a value.
 */
function withTokenInUrl(token: string) {
  window.history.replaceState({}, "", token ? `/invite?token=${token}` : "/invite");
}

const VALID = {
  "Your name": "Ada Lovelace",
  "Work email": "ada@example.com",
  Password: "correct-horse-battery",
};

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of Object.entries(VALID)) {
    await user.type(screen.getByLabelText(label), value);
  }
}

function mockFetch(response: Record<string, unknown> = {}) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ created: true, email: VALID["Work email"] }),
    ...response,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.restoreAllMocks();
  withTokenInUrl(TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what the invite page shows", () => {
  it("asks for the three fields the backend contract accepts", () => {
    render(<InvitePage hasToken />);

    for (const label of Object.keys(VALID)) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("does not name an organization it cannot safely know", () => {
    render(<InvitePage hasToken />);

    // The backend offers no way to resolve an invite to an organization before
    // registration, so the copy stays deliberately generic.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /join a potriv workspace/i,
    );
    expect(screen.getByText(/you've been invited to join a potriv workspace/i))
      .toBeInTheDocument();
  });

  /**
   * The token is a capability. It arrives in the URL and must go no further
   * than the one request that spends it.
   */
  it("never renders the token, in any field or any text", () => {
    // The token is in the URL for this render, so an implementation that echoed
    // it would be caught here rather than passing by never having it.
    expect(window.location.search).toContain(TOKEN);
    const { container } = render(<InvitePage hasToken />);

    expect(container.textContent).not.toContain(TOKEN);
    for (const input of container.querySelectorAll("input")) {
      expect(input.value).not.toContain(TOKEN);
    }
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("treats a missing token exactly like a dead one", () => {
    render(<InvitePage hasToken={false} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /no longer valid/i,
    );
    expect(screen.queryByLabelText("Work email")).toBeNull();
  });
});

describe("submitting the form", () => {
  it("does not call the backend when the form is empty", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/enter your name/i)).toBeInTheDocument();
  });

  it("sends the token through the BFF, never to the backend directly", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByRole("heading", { name: /your account is ready/i });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/register-invite");
    expect(url).not.toMatch(/^https?:\/\//);

    // The token goes in the body, not this route's own path, so it stays out of
    // the address bar, out of path-based access logs and out of any Referer.
    expect(url).not.toContain(TOKEN);
    expect(JSON.parse(String(init.body))).toMatchObject({ token: TOKEN });
  });

  it("does not persist the token anywhere in the browser", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByRole("heading", { name: /your account is ready/i });

    // Read the stores by enumeration rather than by serialising them: a Storage
    // object has no own enumerable properties, so JSON.stringify reports nothing
    // and the assertion would pass without looking at anything. Guarded because
    // jsdom does not always expose the stores.
    const dump = (store: Storage | undefined) =>
      store
        ? Array.from({ length: store.length }, (_, i) => {
            const key = store.key(i) ?? "";
            return `${key}=${store.getItem(key) ?? ""}`;
          }).join(";")
        : "";

    expect(dump(globalThis.localStorage)).not.toContain(TOKEN);
    expect(dump(globalThis.sessionStorage)).not.toContain(TOKEN);
    expect(document.cookie ?? "").not.toContain(TOKEN);

    // The token did reach the request — otherwise the checks above would be
    // proving nothing about a token that was never handled at all.
    expect(JSON.stringify(fetchSpy.mock.calls[0]?.[1])).toContain(TOKEN);
  });
});

describe("when the invite is dead", () => {
  /**
   * The backend answers 404 for a token it has never seen and 400 for one that
   * has expired or been revoked. Both must reach the reader as one sentence:
   * telling them apart would confirm whether a guessed token was ever real.
   */
  it("gives one neutral state, whatever the backend distinguished", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: "INVITE_INVALID", message: "This invite is no longer valid." },
      }),
    });
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("heading", { name: /no longer valid/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/ask your organization administrator/i)).toBeInTheDocument();
  });

  it("leaks nothing about the organization or the token", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: "INVITE_INVALID", message: "This invite is no longer valid." },
      }),
    });
    const user = userEvent.setup();
    const { container } = render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByRole("heading", { name: /no longer valid/i });

    const text = container.textContent ?? "";
    expect(text).not.toContain(TOKEN);
    expect(text).not.toMatch(/expired|revoked|not found|unknown token|already used/i);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("removes the form, because there is nothing useful to retype", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: "INVITE_INVALID", message: "This invite is no longer valid." },
      }),
    });
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByRole("heading", { name: /no longer valid/i });

    expect(screen.queryByRole("button", { name: /create account/i })).toBeNull();
  });
});

describe("when the address is already taken", () => {
  it("says so, because that is about the reader's own input", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: "VALIDATION", message: "Email address is already used." },
      }),
    });
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already used/i);
    // Still recoverable: the invite itself is fine, so the form stays.
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });
});

describe("after a successful registration", () => {
  it("names the account that was created", async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("heading", { name: /your account is ready/i }))
      .toBeInTheDocument();
    expect(screen.getByText(VALID["Work email"], { exact: false })).toBeInTheDocument();
  });

  /**
   * `register-employee` returns no token pair, so nobody is signed in. Implying
   * otherwise would describe a session that does not exist.
   */
  it("does not claim the new employee is signed in", async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByRole("heading", { name: /your account is ready/i });

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /go to (home|workspace)/i })).toBeNull();
  });

  it("survives an unreachable backend without claiming an account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<InvitePage hasToken />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /your account is ready/i })).toBeNull();
  });
});
