import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

/**
 * The coarse routing gate, and the boundary of what it is allowed to decide.
 *
 * This file exists because the Next 16 migration renamed `middleware` to
 * `proxy`, and a rename of a security-adjacent file deserves evidence rather
 * than a passing build. Every assertion here is about behaviour that was true
 * before the rename and must stay true after it.
 *
 * What the proxy must never become: it holds no authority. A present cookie
 * earns a request the chance to be checked by the protected layout's
 * `/auth/me` call — nothing more. Tests that would make it an authorization
 * point (decoding a token, asking the backend) would be testing the wrong
 * design.
 */

const ACCESS = "potriv_access_token";
const REFRESH = "potriv_refresh_token";

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = new URL(path, "https://potriv.test");
  const req = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

/** The matcher is a route pattern, not a regex; this mirrors Next's `:path*`. */
function matches(pathname: string): boolean {
  return config.matcher.some((pattern) => {
    const base = pattern.replace("/:path*", "");
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

describe("which routes the proxy guards", () => {
  it.each(["/home", "/projects", "/staffing", "/people", "/skills", "/organization"])(
    "covers %s and everything under it",
    (domain) => {
      expect(matches(domain)).toBe(true);
      expect(matches(`${domain}/anything/deeper`)).toBe(true);
    },
  );

  it.each([
    ["/login", "guarding it would lock out the people who need it"],
    ["/forgot-password", "same"],
    ["/reset-password", "same"],
    ["/console", "a developer tool with its own token"],
    ["/api/auth/refresh", "the recovery path itself — guarding it would loop"],
    ["/api/auth/login", "same"],
    ["/", "the entry redirector"],
  ])("leaves %s alone — %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  it("does not guard a path that merely starts with a domain's name", () => {
    // `/projects-archive` is not inside `/projects`.
    expect(matches("/projects-archive")).toBe(false);
    expect(matches("/peoplefinder")).toBe(false);
  });
});

describe("what the proxy does with cookies", () => {
  it("lets a request with an access cookie through, deciding nothing else", () => {
    const response = proxy(request("/projects", { [ACCESS]: "any-value" }));

    // `next()` — not a redirect, and not an approval: the protected layout
    // still asks /auth/me before anything is rendered.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends an expired-but-recoverable session through the one refresh path", () => {
    const response = proxy(request("/skills/my", { [REFRESH]: "any-value" }));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/api/auth/refresh");
    expect(location.searchParams.get("returnTo")).toBe("/skills/my");
  });

  it("preserves the query string in returnTo, not just the path", () => {
    const response = proxy(
      request("/projects?view=mine&status=CLOSED", { [REFRESH]: "any-value" }),
    );

    const location = new URL(response.headers.get("location") ?? "");
    // The scope and filter are where the reader was; dropping them lands them
    // somewhere they did not ask for after a refresh they did not notice.
    expect(location.searchParams.get("returnTo")).toBe("/projects?view=mine&status=CLOSED");
  });

  it("sends a request with no cookies at all to login", () => {
    const response = proxy(request("/organization/team-roles"));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
  });

  it("prefers the access cookie when both are present", () => {
    // Having a refresh token as well must not cost a valid session a round trip.
    const response = proxy(request("/home", { [ACCESS]: "a", [REFRESH]: "r" }));

    expect(response.headers.get("location")).toBeNull();
  });

  it("cannot redirect the refresh endpoint into itself", () => {
    // Belt and braces on top of the matcher: even if `/api/auth/refresh` were
    // ever routed here, the matcher excludes it, so no loop can form.
    expect(matches("/api/auth/refresh")).toBe(false);
  });

  it("keeps its redirects on the request's own origin", () => {
    const response = proxy(request("/people", { [REFRESH]: "r" }));

    expect(new URL(response.headers.get("location") ?? "").origin).toBe("https://potriv.test");
  });
});
