import { describe, expect, it } from "vitest";

import { classifyLogoutOutcome, destinationFor } from "./logoutOutcome";

/**
 * Classifying what a sign-out attempt actually established.
 *
 * The interesting cases are all the ways a response can fail to be evidence.
 * Each one used to collapse into "signed out locally", which claimed the BFF had
 * cleared this browser's cookies when nothing showed that it had.
 */

describe("confirmed outcomes", () => {
  it("reads a full success as a global sign-out", () => {
    expect(classifyLogoutOutcome(true, { authenticated: false, revokedEverywhere: true }))
      .toBe("GLOBAL_CONFIRMED");
  });

  it("reads an executed route with an unconfirmed backend as local-only", () => {
    expect(classifyLogoutOutcome(true, { authenticated: false, revokedEverywhere: false }))
      .toBe("LOCAL_ONLY_CONFIRMED");
  });
});

describe("everything else is unconfirmed", () => {
  it.each([
    ["a non-ok response", false, { authenticated: false, revokedEverywhere: false }],
    ["a null body", true, null],
    ["a non-object body", true, "signed out"],
    ["a body missing authenticated:false", true, { revokedEverywhere: false }],
    ["authenticated true", true, { authenticated: true, revokedEverywhere: false }],
    ["a missing revokedEverywhere", true, { authenticated: false }],
    ["a non-boolean revokedEverywhere", true, { authenticated: false, revokedEverywhere: "no" }],
  ])("treats %s as unconfirmed", (_label, ok, body) => {
    expect(classifyLogoutOutcome(ok, body)).toBe("UNCONFIRMED");
  });
});

describe("where each outcome sends the browser", () => {
  it("sends a confirmed global sign-out to login", () => {
    expect(destinationFor("GLOBAL_CONFIRMED")).toBe("/login");
  });

  it("sends a confirmed local-only sign-out to login with the caveat", () => {
    expect(destinationFor("LOCAL_ONLY_CONFIRMED")).toBe("/login?logout=local-only");
  });

  it("sends an unconfirmed outcome back for an authoritative recheck", () => {
    /*
      Not to `/login`: that route redirects an authenticated session to `/home`,
      so a browser whose cookies were never cleared would be told it had signed
      out and then dropped back into the product. Account sits behind the
      protected layout, which resolves the session server-side and redirects on
      its own if the cookies really are gone.
    */
    expect(destinationFor("UNCONFIRMED")).toBe("/account?logout=unconfirmed");
  });

  it("never routes an unconfirmed outcome through the local-only notice", () => {
    expect(destinationFor("UNCONFIRMED")).not.toContain("logout=local-only");
  });
});
