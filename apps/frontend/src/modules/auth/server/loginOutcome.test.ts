import { describe, expect, it } from "vitest";

import { loginFailureStatus } from "./loginOutcome";

/**
 * FE-02 answered 401 for everything, which told a client that a backend outage
 * was a credential problem. The status now says what actually happened; the
 * message deliberately still does not.
 */
describe("loginFailureStatus", () => {
  it("uses 400 for a malformed request", () => {
    expect(loginFailureStatus("VALIDATION")).toBe(400);
  });

  it("uses 401 for wrong credentials", () => {
    expect(loginFailureStatus("INVALID_CREDENTIALS")).toBe(401);
  });

  it("uses 403 when the credentials were fine but the product refuses the session", () => {
    // SYSTEM_ADMIN alone, or no organization: authenticated, not authorised here.
    expect(loginFailureStatus("UNAUTHENTICATED")).toBe(403);
  });

  it("uses a gateway status when the backend cannot be reached", () => {
    // Not 401: nothing was wrong with what the user typed.
    expect(loginFailureStatus("NETWORK")).toBe(502);
  });

  it("uses a gateway status for an unexpected upstream failure", () => {
    expect(loginFailureStatus("SERVER")).toBe(502);
  });

  it("never reports a credential failure for an upstream problem", () => {
    for (const code of ["NETWORK", "SERVER"] as const) {
      expect(loginFailureStatus(code)).not.toBe(401);
    }
  });
});
