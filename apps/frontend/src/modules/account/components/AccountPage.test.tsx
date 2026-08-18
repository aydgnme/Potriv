import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductUser } from "@/modules/auth/model/session";

import type { AccountSession } from "../model/sessionList";
import type { AccountData } from "../server/loadAccount";

import { AccountPage } from "./AccountPage";

/**
 * Account: identity and sessions, with nothing derived.
 *
 * A security screen is the worst place to guess, so these tests mostly assert
 * absences — no city from an IP, no device from a user agent, no "active now"
 * from a timestamp, and no current-session marker invented from a cookie.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("../server/actions/sessionActions", () => ({
  revokeSessionAction: vi.fn(async () => ({})),
  EMPTY_SESSION_STATE: {},
}));

const USER: ProductUser = {
  userId: "u1",
  organizationId: "org-1",
  email: "founder@potriv.test",
  displayName: "Mert Aydogan",
  roles: ["EMPLOYEE", "ORGANIZATION_ADMIN"],
};

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-08-01T09:00:00Z",
    lastSeenAt: "2026-08-18T14:30:00Z",
    revokedAt: null,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    ipAddress: "203.0.113.10",
    currentSession: false,
    ...overrides,
  };
}

function renderAccount(
  data: AccountData,
  user: ProductUser = USER,
  signOutUnconfirmed = false,
) {
  return render(
    <AccountPage user={user} data={data} signOutUnconfirmed={signOutUnconfirmed} />,
  );
}

const ok = (sessions: readonly AccountSession[]): AccountData => ({
  sessions: { ok: true, value: sessions },
});

describe("identity", () => {
  it("shows only fields the session contract carries", () => {
    renderAccount(ok([session({ currentSession: true })]));

    expect(screen.getByText("Mert Aydogan")).toBeInTheDocument();
    expect(screen.getByText("founder@potriv.test")).toBeInTheDocument();

    // None of these exist in `/auth/me` or the product session.
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const invented of ["department", "job title", "seniority", "last login", "member since"]) {
      expect(text).not.toContain(invented);
    }
  });

  it("survives the session read failing", () => {
    renderAccount({ sessions: { ok: false, reason: "ERROR" } });

    // Identity never depended on that call, so it is still on screen.
    expect(screen.getByText("Mert Aydogan")).toBeInTheDocument();
    expect(screen.getByText(/sessions could not be loaded/i)).toBeInTheDocument();
  });

  it("does not call a failed session read an empty session list", () => {
    renderAccount({ sessions: { ok: false, reason: "ERROR" } });

    expect(screen.queryByText(/no other sessions/i)).toBeNull();
    expect(screen.queryByText(/no sessions were returned/i)).toBeNull();
  });
});

describe("sessions", () => {
  it("renders the DTO's own fields and nothing derived from them", () => {
    renderAccount(ok([session({ currentSession: true })]));

    expect(screen.getByText("203.0.113.10")).toBeInTheDocument();
    expect(
      screen.getByText("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    ).toBeInTheDocument();

    const text = (document.body.textContent ?? "").toLowerCase();
    // No geolocation, no device naming, no liveness inference.
    for (const guess of ["macos", "macbook", "chrome on", "united", "active now", "online now"]) {
      expect(text).not.toContain(guess);
    }
  });

  it("takes the current marker from the backend flag, never from a cookie", () => {
    renderAccount(ok([
      session({ sessionId: "22222222-2222-4222-8222-222222222222", currentSession: true }),
      session({ sessionId: "33333333-3333-4333-8333-333333333333", currentSession: false }),
    ]));

    // Stated in words, and exactly once — the flag is the only source.
    expect(screen.getAllByText("Current session")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "This session" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Other sessions" })).toBeInTheDocument();
  });

  it("offers Sign out for the current row rather than a revoke control", () => {
    renderAccount(ok([session({ currentSession: true })]));

    // Revoking the current session at the backend while this browser keeps
    // cookies that could restore it would be the dangerous half-action.
    expect(screen.getByText("Use Sign out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
  });

  it("offers a revoke control on another session", () => {
    renderAccount(ok([
      session({ sessionId: "22222222-2222-4222-8222-222222222222", currentSession: true }),
      session({ sessionId: "33333333-3333-4333-8333-333333333333" }),
    ]));

    expect(screen.getByRole("button", { name: /Revoke the session last seen/ })).toBeInTheDocument();
  });

  it("shows a revoked session as ended and read-only", () => {
    // `findByUserIdOrderByCreatedAtDesc` filters nothing, so revoked rows come
    // back. Dropping them would hide the evidence that a session was closed.
    renderAccount(ok([
      session({ currentSession: true, sessionId: "22222222-2222-4222-8222-222222222222" }),
      session({
        sessionId: "44444444-4444-4444-8444-444444444444",
        revokedAt: "2026-08-17T10:00:00Z",
      }),
    ]));

    expect(screen.getByText(/^Ended /)).toBeInTheDocument();
    expect(screen.getByText("Already ended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
  });

  it("treats a zero-session response as unexpected, not as a tidy empty state", () => {
    renderAccount(ok([]));

    // The session reading the page should be in that list. Saying so beats
    // manufacturing a current row out of cookies.
    expect(screen.getByText(/No sessions were returned, including this one/i)).toBeInTheDocument();
  });

  it("uses a native table with the DTO's columns", () => {
    renderAccount(ok([session({ currentSession: true })]));

    const table = screen.getAllByRole("table")[0];
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());

    expect(headers).toEqual([
      "Session",
      "Created",
      "Last seen",
      "User agent",
      "IP address",
      "Action",
    ]);
  });
});

describe("password", () => {
  it("links to the real reset flow instead of an in-session form", () => {
    renderAccount(ok([session({ currentSession: true })]));

    // There is no authenticated change-password endpoint, so a form here would
    // be a control that cannot save.
    expect(screen.getByRole("link", { name: "Reset password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

describe("what Account is not", () => {
  it("invents no security analytics", () => {
    renderAccount(ok([session({ currentSession: true })]));

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const invented of [
      "security score",
      "suspicious",
      "trusted device",
      "two-factor",
      "passkey",
      "remember this device",
    ]) {
      expect(text).not.toContain(invented);
    }
  });

  it("does not carry project history, which belongs to Projects", () => {
    renderAccount(ok([session({ currentSession: true })]));

    expect(screen.queryByText(/allocation/i)).toBeNull();
  });
});

/**
 * The unconfirmed sign-out warning.
 *
 * Reaching this component at all is the evidence: the protected layout resolves
 * the session server-side and would have redirected to login if the cookies were
 * really gone. So the warning states a fact — you are still signed in here —
 * rather than a suspicion.
 */
describe("after an unconfirmed sign out", () => {
  it("says plainly that nothing was confirmed", () => {
    renderAccount(ok([session({ currentSession: true })]), USER, true);

    expect(
      screen.getByText(/could not confirm whether sign out completed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/still signed in here/i)).toBeInTheDocument();
  });

  it("never claims the local sign-out succeeded", () => {
    renderAccount(ok([session({ currentSession: true })]), USER, true);

    const text = (document.body.textContent ?? "").toLowerCase();
    // The local-only wording belongs to the confirmed case, on the login screen.
    expect(text).not.toContain("you were signed out of this browser");
    expect(text).not.toContain("all sessions");
  });

  it("offers no automatic retry of the mutation", () => {
    renderAccount(ok([session({ currentSession: true })]), USER, true);

    // Replaying an unsafe mutation after an ambiguous one is exactly the danger.
    // The only control is the deliberate trigger further down the page — the
    // confirm button lives inside a closed <dialog>, so it is not reachable
    // until somebody opens it on purpose.
    expect(screen.queryByRole("button", { name: /try again|retry/i })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Sign out everywhere" })).toHaveLength(1);
  });

  it("shows nothing extra on an ordinary visit", () => {
    renderAccount(ok([session({ currentSession: true })]));

    expect(screen.queryByText(/could not confirm whether sign out completed/i)).toBeNull();
  });
});
