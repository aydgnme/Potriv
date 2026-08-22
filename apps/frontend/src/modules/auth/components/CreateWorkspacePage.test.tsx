import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateWorkspacePage } from "./CreateWorkspacePage";

/**
 * Creating a workspace.
 *
 * The contracts that matter here are about honesty: the form must not claim a
 * workspace exists until the backend says so, and it must not imply the new
 * administrator is signed in — because the backend's registration contract
 * returns no tokens and therefore nobody is.
 */

const VALID = {
  "Your name": "Ada Lovelace",
  "Work email": "ada@example.com",
  Password: "correct-horse-battery",
  "Organization name": "Analytical Engines",
  "Headquarters address": "1 Marylebone Road",
};

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of Object.entries(VALID)) {
    await user.type(screen.getByLabelText(label), value);
  }
}

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("before anything is submitted", () => {
  it("asks only for what the backend contract needs", () => {
    render(<CreateWorkspacePage />);

    for (const label of Object.keys(VALID)) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // Five fields and no more: nothing is collected that has nowhere to go.
    expect(screen.getAllByRole("textbox")).toHaveLength(4); // password is not a textbox
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("says plainly what creating a workspace does and does not do", () => {
    render(<CreateWorkspacePage />);

    expect(screen.getByText(/creates one organization and you as its administrator/i))
      .toBeInTheDocument();
  });

  it("offers sign-in to somebody who already has a workspace", () => {
    render(<CreateWorkspacePage />);

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });
});

describe("refusing to submit an invalid form", () => {
  it("does not call the backend when fields are empty", async () => {
    const fetchSpy = mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    // The obvious mistakes are answered without a round trip.
    expect(fetchSpy).not.toHaveBeenCalled();
    // Twice by design: beside the field, and inside the alert that announces it.
    expect(screen.getAllByText(/enter your name/i)).toHaveLength(2);
    expect(
      within(screen.getByRole("alert")).getByText(/your name: enter your name/i),
    ).toBeInTheDocument();
  });

  it("attaches each message to the field it is about", async () => {
    mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await user.type(screen.getByLabelText("Work email"), "not-an-address");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    const email = screen.getByLabelText("Work email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    const describedBy = email.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("email-error");
  });
});

describe("when the backend accepts", () => {
  it("reports the workspace as created and names the administrator", async () => {
    mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByRole("heading", { name: /workspace is ready/i }))
      .toBeInTheDocument();
    expect(screen.getByText(VALID["Work email"], { exact: false })).toBeInTheDocument();
  });

  /**
   * The contract this screen exists to keep.
   *
   * `POST /auth/register-admin` returns no token pair, so the administrator is
   * not signed in. Anything that implied otherwise would be describing a session
   * that does not exist.
   */
  it("does not claim the administrator is signed in", async () => {
    mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    await screen.findByRole("heading", { name: /workspace is ready/i });

    // It sends them to sign in, rather than to the product.
    const next = screen.getByRole("link", { name: /sign in/i });
    expect(next).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /go to (home|dashboard)/i })).toBeNull();
  });

  it("posts to the BFF boundary, never to the backend directly", async () => {
    const fetchSpy = mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    await screen.findByRole("heading", { name: /workspace is ready/i });
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // A same-origin path: the browser never learns the backend's address.
    expect(url).toBe("/api/auth/register-workspace");
    expect(url).not.toMatch(/^https?:\/\//);
  });
});

describe("when the backend refuses", () => {
  it("shows the refusal without claiming success", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: "VALIDATION", message: "Email address is already used." },
      }),
    });
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already used/i);
    expect(screen.queryByRole("heading", { name: /workspace is ready/i })).toBeNull();
  });

  it("keeps what was typed so the form can be corrected, not retyped", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: "VALIDATION", message: "Email address is already used." },
      }),
    });
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create workspace/i }));
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Organization name")).toHaveValue(
      VALID["Organization name"],
    );
  });

  it("survives an unreachable backend without reporting a workspace", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /workspace is ready/i })).toBeNull();
  });
});

/**
 * Five fields, one announcement.
 *
 * This is the form that decides the announcement model. Making each field error
 * live would fire five assertive regions at once, in whatever order the DOM
 * happened to settle. One summary says what went wrong, once — and the visible
 * per-field messages stay exactly where they were.
 */
describe("a failed submission is announced once, not five times", () => {
  it("puts every problem in a single alert, named by field", async () => {
    const fetchSpy = mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    // Focus the submit control and press Enter — no pointer.
    screen.getByRole("button", { name: /create workspace/i }).focus();
    await user.keyboard("{Enter}");

    expect(fetchSpy).not.toHaveBeenCalled();

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    const alert = within(alerts[0]);

    // Named by the same labels the form shows, in the same order it shows them.
    expect(alert.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Your name: Enter your name.",
      "Work email: Enter your work email.",
      "Password: Choose a password.",
      "Organization name: Name your organization.",
      "Headquarters address: Enter a headquarters address.",
    ]);
    expect(alerts[0]).toHaveTextContent("Check 5 fields");
  });

  it("does not make the messages beside the fields live as well", async () => {
    mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    screen.getByRole("button", { name: /create workspace/i }).focus();
    await user.keyboard("{Enter}");

    // Exactly one live region on the page. Anything else would announce the same
    // failure twice.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("shrinks the announcement as fields are corrected", async () => {
    mockFetchOnce({});
    const user = userEvent.setup();
    render(<CreateWorkspacePage />);

    screen.getByRole("button", { name: /create workspace/i }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Check 5 fields");

    await user.type(screen.getByLabelText("Your name"), "Ada Lovelace");
    screen.getByRole("button", { name: /create workspace/i }).focus();
    await user.keyboard("{Enter}");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Check 4 fields");
    expect(within(alert).queryByText(/^Your name:/)).toBeNull();
  });
});
