import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils";
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

function request(
  path: string,
  cookies: Record<string, string> = {},
  method = "GET",
): NextRequest {
  const url = new URL(path, "https://potriv.test");
  const req = new NextRequest(url, { method });
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

/**
 * Next's own matcher, not a local approximation.
 *
 * Next 16 ships `unstable_doesMiddlewareMatch`, which evaluates the real
 * matcher semantics against a config — so these assertions test the framework's
 * behaviour rather than a re-implementation of it that could drift from it.
 *
 * It is imported from the module path rather than the `next/experimental/
 * testing/server` barrel: the barrel additionally pulls in server internals
 * that need `AsyncLocalStorage` and throw under jsdom. Next 16.3.1's own docs
 * name this export `unstable_doesProxyMatch`, but the shipped package only
 * exports `unstable_doesMiddlewareMatch` — verified against the installed
 * package, so the shipped name is the one used here.
 */
function matches(pathname: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: pathname });
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
    ["/console", "a developer tool with its own token, and dev-only in the build"],
    ["/api/auth/refresh", "the recovery path itself — guarding it would loop"],
    ["/api/auth/login", "same"],
    ["/", "the entry redirector"],
  ])("leaves %s alone — %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  /*
    The credential-bearing pages are matched now, and it is worth being precise
    about what changed and what did not.

    They were outside the matcher because the proxy's only job was the
    session-recovery redirect, and redirecting somebody away from `/login`
    locks out exactly the person who needs it. The proxy has a second job now —
    putting a strict Content-Security-Policy on the pages that hold a token or
    a password — and that job has to run on those pages, so they are in the
    matcher.

    The old guarantee is unchanged and is asserted below as behaviour rather
    than as routing: these paths are never redirected, whatever cookies the
    request carries. That is the assertion that actually protects the user; the
    matcher entry never was.
  */
  it.each([
    "/login",
    "/forgot-password",
    "/reset-password",
    "/invite",
    "/create-workspace",
    "/create-workspace/verify",
  ])(
    "runs on %s for the CSP, and never redirects it",
    (path) => {
      expect(matches(path)).toBe(true);

      const jars: Record<string, string>[] = [{}, { [REFRESH]: "stale" }, { [ACCESS]: "any" }];
      for (const cookies of jars) {
        const response = proxy(request(path, cookies));
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
      }
    },
  );

  it("serves the credential-bearing pages under a nonce policy", () => {
    const policy = proxy(request("/invite")).headers.get("content-security-policy");

    expect(policy).toContain("script-src 'self' 'nonce-");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("gives every request its own nonce", () => {
    // A reused nonce is an allow-list entry an injected script can copy.
    const first = proxy(request("/login")).headers.get("content-security-policy");
    const second = proxy(request("/login")).headers.get("content-security-policy");

    expect(first).not.toBe(second);
  });

  it("puts the policy on the request too, so Next can nonce its own scripts", () => {
    /* Next discovers the nonce by reading `Content-Security-Policy` off the
       incoming request. A response-only header enforces a policy against a page
       that cannot then hydrate. */
    const response = proxy(request("/reset-password"));
    const forwarded = response.headers.get("x-middleware-override-headers") ?? "";

    expect(forwarded).toContain("x-nonce");
    expect(forwarded).toContain("content-security-policy");
  });

  it("puts no policy on an ordinary product route", () => {
    // The strict policy is scoped on purpose; the product is not force-dynamic.
    const response = proxy(request("/projects", { [ACCESS]: "any" }));

    expect(response.headers.get("content-security-policy")).toBeNull();
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

/**
 * The request method matters, because the recovery path is a redirect.
 *
 * Protected routes host Server Actions, and those arrive as POST to the page's
 * own URL — which the matcher guards. A 307 or 308 tells the client to repeat
 * the request verbatim, method and body included, at the new location. Sending
 * a mutation into `/api/auth/refresh` that way is wrong twice over: that route
 * is GET-only, so it answers 405 and the session is never recovered; and the
 * request body — the user's form data — gets transmitted to an endpoint that
 * has no business receiving it.
 *
 * 303 See Other is the status that exists for this. RFC 9110 requires the
 * client to re-issue as GET and drop the body, which turns an interrupted
 * mutation into an ordinary navigation: the session is recovered, the user
 * lands back on the page, and the action is theirs to retry deliberately.
 */
const SAFE = ["GET", "HEAD"] as const;
const UNSAFE = ["POST", "PUT", "PATCH", "DELETE"] as const;

describe("request method and the recovery redirect", () => {
  it.each(SAFE)("%s with a refresh cookie keeps the method-preserving redirect", (method) => {
    const response = proxy(request("/projects", { [REFRESH]: "r" }, method));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/api/auth/refresh");
  });

  it.each(UNSAFE)("%s with a refresh cookie must not be replayed into refresh", (method) => {
    const response = proxy(request("/organization/departments", { [REFRESH]: "r" }, method));

    // The specific failure this guards: 307/308 would re-issue the mutation,
    // body and all, against a GET-only route.
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(308);
    expect(response.status).toBe(303);
  });

  it.each(UNSAFE)("%s still recovers the session rather than dropping it", (method) => {
    const response = proxy(request("/organization/departments", { [REFRESH]: "r" }, method));

    // Failing closed to /login would work, but it discards a session that is
    // still recoverable. 303 gets the same safety at no cost to the user.
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/api/auth/refresh");
    expect(location.searchParams.get("returnTo")).toBe("/organization/departments");
  });

  it.each(UNSAFE)("%s with no cookies at all is not replayed into login either", (method) => {
    const response = proxy(request("/projects", {}, method));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it.each(SAFE)("%s with no cookies keeps the method-preserving redirect to login", (method) => {
    const response = proxy(request("/projects", {}, method));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it.each([...SAFE, ...UNSAFE])("%s with a valid access cookie passes through untouched", (method) => {
    const response = proxy(request("/organization/departments", { [ACCESS]: "a" }, method));

    // No redirect at all — the action runs and re-derives its own authority.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats an unrecognised method as unsafe", () => {
    // Fail closed on anything not known to be safe, rather than enumerating
    // every verb that must not be replayed.
    const response = proxy(request("/projects", { [REFRESH]: "r" }, "PROPFIND"));

    expect(response.status).toBe(303);
  });

  it("preserves the query string in returnTo for a mutation too", () => {
    const response = proxy(
      request("/projects?view=mine&status=CLOSED", { [REFRESH]: "r" }, "POST"),
    );

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("returnTo")).toBe("/projects?view=mine&status=CLOSED");
  });
});
