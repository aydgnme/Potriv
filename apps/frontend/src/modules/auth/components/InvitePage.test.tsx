import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitePage } from "./InvitePage";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));

/**
 * Joining a workspace by invitation.
 *
 * Three things this page must not do, and every test here defends one of them:
 * show or persist the invite token, say which kind of invalid an invite is, or
 * imply the new employee is signed in when the backend issued no session.
 */

const TOKEN = "invite-token-value-abc123";

/**
 * The token reaches the component the way it reaches it in production: in the
 * URL **fragment**. It is not a prop and cannot be one — a fragment never
 * reaches the server, so the server component that renders this has no value to
 * pass down. The tests therefore set the URL, exactly as the browser would.
 */
function withTokenInUrl(token: string) {
  window.history.replaceState({}, "", token ? `/invite#token=${token}` : "/invite");
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
    render(<InvitePage authenticated={false} />);

    for (const label of Object.keys(VALID)) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("does not name an organization it cannot safely know", () => {
    render(<InvitePage authenticated={false} />);

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
    // The token is in the URL going in, so an implementation that echoed it
    // would be caught here rather than passing by never having had it.
    expect(window.location.hash).toContain(TOKEN);
    const { container } = render(<InvitePage authenticated={false} />);

    expect(container.textContent).not.toContain(TOKEN);
    for (const input of container.querySelectorAll("input")) {
      expect(input.value).not.toContain(TOKEN);
    }
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("treats a missing token exactly like a dead one", () => {
    withTokenInUrl("");
    render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
    // The message now appears twice on purpose: beside the field, and inside the
    // one alert that announces the failure. Both are asserted rather than one
    // being queried loosely enough to match either.
    expect(screen.getAllByText(/enter your name/i)).toHaveLength(2);
    expect(
      within(screen.getByRole("alert")).getByText(/your name: enter your name/i),
    ).toBeInTheDocument();
  });

  it("sends the token through the BFF, never to the backend directly", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();
    render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

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
    const { container } = render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

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
    render(<InvitePage authenticated={false} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByRole("heading", { name: /your account is ready/i });

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /go to (home|workspace)/i })).toBeNull();
  });

  it("survives an unreachable backend without claiming an account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<InvitePage authenticated={false} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /your account is ready/i })).toBeNull();
  });
});

describe("what the page does with the token it was given", () => {
  it("removes it from the address bar as soon as it has been read", () => {
    render(<InvitePage authenticated={false} />);

    // The form is on screen, so the token *was* read...
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    // ...and the address bar no longer carries it.
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
  });

  it("leaves no copy of it in storage", () => {
    render(<InvitePage authenticated={false} />);

    // Indexed access rather than Object.keys: a Storage is not a plain object,
    // and the test environment does not always provide both.
    for (const store of [window.localStorage, window.sessionStorage]) {
      if (!store) continue;
      const values: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null) values.push(store.getItem(key) ?? "");
      }
      expect(values.join("|")).not.toContain(TOKEN);
    }
    expect(document.cookie).not.toContain(TOKEN);
  });

  it("still sends it after the address bar has been cleared", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(<InvitePage authenticated={false} />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    // Read once into memory, spent once — the cleared URL does not lose it.
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(body.token).toBe(TOKEN);
  });
});
