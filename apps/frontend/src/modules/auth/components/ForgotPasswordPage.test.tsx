import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordPage } from "./ForgotPasswordPage";

/**
 * Asking for a reset link.
 *
 * Two things have to hold at once. The summary must name the field the way the
 * field names itself — it said "Work email" beside an `Email` box, which sends a
 * speech-input user hunting for a control that is not on the page. And the
 * confirmation must stay neutral: the backend answers 202 whether or not the
 * address exists, precisely so this form cannot be used to check which addresses
 * are registered.
 */

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockRequest(ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 202 : 500,
    json: async () => ({}),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

async function submitFromKeyboard(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) {
  screen.getByLabelText("Email").focus();
  if (email) await user.keyboard(email);
  await user.tab();
  await user.keyboard("{Enter}");
}

describe("the summary names the field the way the field does", () => {
  it("uses the visible label, not a different one", async () => {
    mockRequest();
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    // The visible label, taken from the page rather than assumed.
    const visible = screen.getByLabelText("Email");
    expect(visible).toBeInTheDocument();

    await submitFromKeyboard(user, "not-an-email");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Email: Enter a valid email address.")).toBeInTheDocument();
    // The old wording named a control that does not exist on this page.
    expect(alert).not.toHaveTextContent("Work email");
  });

  it("keeps the field associated with its own message", async () => {
    mockRequest();
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await submitFromKeyboard(user, "not-an-email");
    await screen.findByRole("alert");

    const control = screen.getByLabelText("Email");
    expect(control).toHaveAttribute("aria-invalid", "true");
    const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      "Enter a valid email address.",
    );
  });

  it("announces a repeated identical failure again", async () => {
    mockRequest();
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await submitFromKeyboard(user, "not-an-email");
    const first = await screen.findByRole("alert");

    screen.getByRole("button", { name: /send reset link/i }).focus();
    await user.keyboard("{Enter}");
    const second = await screen.findByRole("alert");

    // Same words, new attempt: the region is replaced so it is announced again.
    expect(second).not.toBe(first);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("the confirmation gives nothing away", () => {
  it("does not say whether the account exists", async () => {
    const fetchSpy = mockRequest();
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await submitFromKeyboard(user, "someone@example.com");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "If an account exists for this email, a password reset link has been sent.",
    );
    // Nothing that would confirm or deny registration.
    expect(status).not.toHaveTextContent(/we have sent|your account|no account|not found/i);
  });

  it("reports a transport failure without implying anything about the address", async () => {
    mockRequest(false);
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await submitFromKeyboard(user, "someone@example.com");

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/no account|does not exist|unknown address/i);
  });
});
