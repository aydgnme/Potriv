import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/enter your name/i)).toBeInTheDocument();
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
