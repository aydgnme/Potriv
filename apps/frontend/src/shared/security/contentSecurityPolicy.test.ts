import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BASELINE_SECURITY_HEADERS } from "../../../next.config";
import { config as proxyConfig } from "../../../proxy";

import {
  SENSITIVE_ROUTES,
  buildContentSecurityPolicy,
  generateNonce,
  isSensitiveRoute,
} from "./contentSecurityPolicy";

/**
 * The policy's contract, and the three ways it can rot without anyone noticing.
 *
 * These assertions are deliberately *not* the whole story, and the security
 * documentation says so: a policy string can be perfect and still be wrong
 * about the page it lands on. `tests/security-headers.spec.ts` drives a real
 * production build in a real browser and fails on real console violations.
 * This file covers what a browser test cannot: that the pieces stay wired to
 * each other when somebody edits one of them.
 */

const PRODUCTION = buildContentSecurityPolicy({ nonce: "TESTNONCE", development: false });

function directive(policy: string, name: string): string | null {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found === undefined ? null : found;
}

describe("the production policy", () => {
  it("never permits eval", () => {
    /* A page holding a live reset token must not be able to compile a string
       into code. This is the single assertion most worth having: the
       development branch legitimately needs `unsafe-eval` for React Refresh,
       and the failure mode is somebody deleting the branch that keeps it out
       of production. */
    expect(PRODUCTION).not.toContain("unsafe-eval");
  });

  it("never permits an inline script", () => {
    expect(directive(PRODUCTION, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("allows scripts only from this origin and the request's nonce", () => {
    expect(directive(PRODUCTION, "script-src")).toBe(
      "script-src 'self' 'nonce-TESTNONCE'",
    );
  });

  it("does not use strict-dynamic, which would discard the origin allow-list", () => {
    // 'strict-dynamic' makes CSP3 browsers ignore 'self'. See the note in
    // contentSecurityPolicy.ts.
    expect(PRODUCTION).not.toContain("strict-dynamic");
  });

  it.each([
    ["default-src", "default-src 'self'"],
    ["object-src", "object-src 'none'"],
    ["base-uri", "base-uri 'none'"],
    ["frame-ancestors", "frame-ancestors 'none'"],
    ["frame-src", "frame-src 'none'"],
    ["form-action", "form-action 'self'"],
    ["connect-src", "connect-src 'self'"],
    ["img-src", "img-src 'self' data: blob:"],
    ["font-src", "font-src 'self'"],
  ])("pins %s", (name, expected) => {
    expect(directive(PRODUCTION, name)).toBe(expected);
  });

  it("upgrades insecure requests", () => {
    expect(directive(PRODUCTION, "upgrade-insecure-requests")).toBe(
      "upgrade-insecure-requests",
    );
  });

  it("permits no third-party origin anywhere", () => {
    /*
      The analytics/RUM rule, as an assertion rather than a promise. Any
      directive naming a host — a tag manager, a collector, a font CDN — shows
      up here as a token containing a dot that is not one of the schemes we
      allow, and fails.
    */
    const allowed = new Set([
      "'self'",
      "'none'",
      "'nonce-TESTNONCE'",
      "'unsafe-inline'",
      "data:",
      "blob:",
    ]);
    const hosts = PRODUCTION.split(";")
      .flatMap((part) => part.trim().split(" ").slice(1))
      .filter((token) => token.length > 0 && !allowed.has(token));

    expect(hosts).toEqual([]);
  });
});

describe("the development policy", () => {
  const development = buildContentSecurityPolicy({ nonce: "N", development: true });

  it("permits eval, because React Refresh needs it", () => {
    expect(directive(development, "script-src")).toContain("'unsafe-eval'");
  });

  it("permits the hot-reload websocket", () => {
    expect(directive(development, "connect-src")).toBe("connect-src 'self' ws: wss:");
  });

  it("still refuses plugins, framing and a rewritten base URI", () => {
    // The relaxations are for the toolchain, not a different security posture.
    expect(directive(development, "object-src")).toBe("object-src 'none'");
    expect(directive(development, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(development, "base-uri")).toBe("base-uri 'none'");
  });
});

describe("the nonce", () => {
  it("is different every time", () => {
    const nonces = new Set(Array.from({ length: 64 }, generateNonce));
    expect(nonces.size).toBe(64);
  });

  it("carries 128 bits", () => {
    // 16 bytes, base64 — a predictable nonce is the same as no nonce.
    expect(atob(generateNonce())).toHaveLength(16);
  });
});

describe("the route list", () => {
  it("covers every page named in the security review", () => {
    expect([...SENSITIVE_ROUTES].sort()).toEqual([
      "/create-workspace",
      "/create-workspace/verify",
      "/forgot-password",
      "/invite",
      "/login",
      "/reset-password",
    ]);
  });

  it("appears verbatim in the proxy's matcher", () => {
    /* Two lists that must agree: the matcher decides whether `proxy` runs at
       all, `SENSITIVE_ROUTES` decides whether it builds a policy once it has. A
       route in the matcher but not the list would be served with no CSP; a
       route in the list but not the matcher would never reach the code that
       reads it. The matcher cannot import the list — Next evaluates the config
       object statically — so this assertion is the only thing keeping the
       duplicate honest. */
    const matched = proxyConfig.matcher.filter((route) => !route.includes(":"));
    expect([...matched].sort()).toEqual([...SENSITIVE_ROUTES].sort());
  });

  it("matches exactly, never by prefix", () => {
    expect(isSensitiveRoute("/login")).toBe(true);
    expect(isSensitiveRoute("/login/extra")).toBe(false);
    expect(isSensitiveRoute("/home")).toBe(false);
  });

  it.each(SENSITIVE_ROUTES)(
    "%s is rendered per request, so it can carry a nonce",
    (route) => {
      /*
        The pairing a string test would otherwise miss. A nonce-based CSP on a
        statically prerendered page blocks that page's own hydration script —
        the page ships a nonce from build time and the header carries a
        different one. The only way to keep them in step is to render the page
        for the request that carries the header.
      */
      // Vitest runs from the frontend root, which is where `app/` lives.
      const source = readFileSync(
        resolve(process.cwd(), `app/(product)${route}/page.tsx`),
        "utf8",
      );
      expect(source).toContain('export const dynamic = "force-dynamic"');
    },
  );
});

describe("the baseline headers", () => {
  const byKey = new Map(BASELINE_SECURITY_HEADERS.map((h) => [h.key, h.value]));

  it("sets nosniff", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets HSTS for two years, including subdomains", () => {
    expect(byKey.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("denies the capabilities this product never uses", () => {
    const policy = byKey.get("Permissions-Policy") ?? "";
    for (const capability of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${capability}=()`);
    }
  });

  it("refuses framing for the routes the CSP does not cover", () => {
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
  });
});
