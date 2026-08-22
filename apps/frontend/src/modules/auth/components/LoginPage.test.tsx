import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

/**
 * Sign in, and the two things that must stay true about how it fails.
 *
 * **A failed submission has to say so.** This form is where the V2-09 WCAG 4.1.3
 * defect was found: the field errors appeared, carried `aria-invalid`, resolved
 * through `aria-describedby` — and announced nothing. Somebody using a screen
 * reader pressed Enter and heard silence.
 *
 * **And it must not say too much.** Every credential failure answers with one
 * generic sentence, because unknown email, wrong password, inactive and locked
 * are answered identically by the backend so the form cannot be used to discover
 * which addresses exist. Announcing it must not undo that.
 */

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The envelope `/api/auth/login` returns for any rejected credential. */
const CREDENTIAL_REJECTION = {
  error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
};

function mockLogin(response: { ok: boolean; status?: number; body?: unknown }) {
  const spy = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 401),
    json: async () => response.body ?? {},
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Types into a field and submits, using nothing but the keyboard. */
async function submitFromKeyboard(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  screen.getByLabelText("Email").focus();
  if (email) await user.keyboard(email);
  await user.tab();
  if (password) await user.keyboard(password);
  await user.tab();
  // Focus is on the submit control; Enter activates it. No pointer anywhere.
  await user.keyboard("{Enter}");
}

describe("validation failure is announced, from the keyboard", () => {
  it("announces both field problems in one alert", async () => {
    const fetchSpy = mockLogin({ ok: true });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "not-an-email", "short");

    // Never sent: the obvious mistakes are answered without a round trip.
    expect(fetchSpy).not.toHaveBeenCalled();

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Check 2 fields");
    expect(within(alerts[0]).getByText("Email: Enter a valid email address.")).toBeInTheDocument();
    expect(
      within(alerts[0]).getByText("Password: Password must be 8–72 characters."),
    ).toBeInTheDocument();
  });

  it("still associates each message with the control it is about", async () => {
    mockLogin({ ok: true });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "not-an-email", "short");

    for (const [label, message] of [
      ["Email", "Enter a valid email address."],
      ["Password", "Password must be 8–72 characters."],
    ] as const) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute("aria-invalid", "true");
      const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(message);
    }
  });

  it("keeps what was typed, so nobody has to start again", async () => {
    mockLogin({ ok: true });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "ada@example.com", "short");

    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("replaces stale feedback when the corrected form is resubmitted", async () => {
    const fetchSpy = mockLogin({ ok: true });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "not-an-email", "correct-horse-battery");
    expect(screen.getByRole("alert")).toHaveTextContent("Check one field");

    // Fix the email and submit again, still without a pointer.
    screen.getByLabelText("Email").focus();
    await user.keyboard("{Control>}a{/Control}ada@example.com");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });
});

describe("a credential failure says one generic thing", () => {
  it("announces it without naming which half was wrong", async () => {
    mockLogin({ ok: false, status: 401, body: CREDENTIAL_REJECTION });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "ada@example.com", "correct-horse-battery");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid email or password/i);
    // Nothing that would distinguish "no such account" from "wrong password".
    expect(alert).not.toHaveTextContent(/not found|no account|unknown|does not exist|locked|inactive/i);
  });

  it("is one alert, not a form-level one plus a field summary", async () => {
    mockLogin({ ok: false, status: 401, body: CREDENTIAL_REJECTION });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "ada@example.com", "correct-horse-battery");

    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // A rejected credential is not a field-level problem, so nothing is marked
    // invalid — that would tell the user their input was malformed when it was
    // merely wrong.
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("leaves the page on success instead of announcing anything", async () => {
    mockLogin({ ok: true, body: { authenticated: true } });
    const user = userEvent.setup();
    render(<LoginPage />);

    await submitFromKeyboard(user, "ada@example.com", "correct-horse-battery");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
