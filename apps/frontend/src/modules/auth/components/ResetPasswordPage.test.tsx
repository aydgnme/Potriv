import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "./ResetPasswordPage";

/**
 * Setting a new password from an emailed link.
 *
 * The reset token is the most dangerous credential this application mails: it
 * takes over an account that already exists. It used to travel as `?token=`,
 * which every server, proxy and trace between the reader and this page records.
 *
 * These tests hold the three properties that replaced that: the token arrives
 * in the fragment, it leaves the address bar as soon as it has been read, and it
 * is still spendable afterwards — because a "safer" version that loses the token
 * would just be broken.
 */

const TOKEN = "reset-token-value-abc123";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function withTokenInFragment(token: string) {
  window.history.replaceState(
    {}, "", token ? `/reset-password#token=${token}` : "/reset-password",
  );
}

function mockFetch(ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 204 : 400,
    json: async () => ({ error: { code: "VALIDATION", message: "No." } }),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

async function fillPasswords(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("New password"), "correct-horse-battery");
  await user.type(screen.getByLabelText("Confirm new password"), "correct-horse-battery");
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
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("treats a missing token as a dead link", () => {
    withTokenInFragment("");
    render(<ResetPasswordPage />);

    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/no longer valid/i);
  });

  it("ignores a token in the query string", () => {
    /*
      The old form. It must not work: a link shaped this way would put the token
      back into every access log between the reader and this page, and accepting
      it would keep that shape alive indefinitely.
    */
    window.history.replaceState({}, "", `/reset-password?token=${TOKEN}`);
    render(<ResetPasswordPage />);

    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("removes it from the address bar once read", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
  });
});

describe("what the page does with it", () => {
  it("never renders it", () => {
    const { container } = render(<ResetPasswordPage />);

    expect(container.textContent).not.toContain(TOKEN);
    for (const input of container.querySelectorAll("input")) {
      expect(input.value).not.toContain(TOKEN);
    }
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("leaves no copy in storage or cookies", () => {
    render(<ResetPasswordPage />);

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

  it("still sends it after the address bar has been cleared, in the body", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(<ResetPasswordPage />);
    await fillPasswords(user);
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    const [url, init] = fetchSpy.mock.calls[0];
    // The request the browser makes carries nothing in its URL.
    expect(String(url)).not.toContain(TOKEN);
    expect(String(url)).not.toContain("token=");
    expect(JSON.parse(String(init.body)).token).toBe(TOKEN);
  });
});
