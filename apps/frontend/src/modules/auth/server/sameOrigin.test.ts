import { describe, expect, it } from "vitest";

import { isSameOriginRequest, type OriginSignals } from "./sameOrigin";

/**
 * `SameSite=Lax` does not cover the refresh route: Lax cookies are sent on
 * top-level cross-site GET navigations, and that GET rotates credentials. These
 * cases pin the boundary that does cover it.
 */

const EXPECTED = "https://potriv.example";

function signals(overrides: Partial<OriginSignals> = {}): OriginSignals {
  return {
    secFetchSite: null,
    origin: null,
    referer: null,
    expectedOrigin: EXPECTED,
    ...overrides,
  };
}

describe("isSameOriginRequest", () => {
  it("accepts a matching origin", () => {
    expect(isSameOriginRequest(signals({ origin: EXPECTED }))).toBe(true);
  });

  it("rejects a different host", () => {
    expect(isSameOriginRequest(signals({ origin: "https://evil.example" }))).toBe(false);
  });

  it("rejects the same host on a different scheme", () => {
    // The previous implementation compared only `.host`, so this passed.
    expect(isSameOriginRequest(signals({ origin: "http://potriv.example" }))).toBe(false);
  });

  it("rejects the same host on a different port", () => {
    expect(isSameOriginRequest(signals({ origin: "https://potriv.example:8443" }))).toBe(
      false,
    );
  });

  it("rejects a malformed Origin", () => {
    expect(isSameOriginRequest(signals({ origin: "not-a-url" }))).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(
      isSameOriginRequest(signals({ referer: `${EXPECTED}/staffing?status=PENDING` })),
    ).toBe(true);
    expect(isSameOriginRequest(signals({ referer: "https://evil.example/lure" }))).toBe(
      false,
    );
  });

  it("rejects a malformed Referer", () => {
    expect(isSameOriginRequest(signals({ referer: "://broken" }))).toBe(false);
  });

  // ---- Fetch Metadata: the part SameSite=Lax cannot do ----

  it("rejects a cross-site request even when Origin and Referer are absent", () => {
    // Exactly the gap this task exists to close: a cross-site top-level
    // navigation under a strict referrer policy carries neither header.
    expect(
      isSameOriginRequest(signals({ secFetchSite: "cross-site" })),
    ).toBe(false);
  });

  it("rejects cross-site even if the request claims a matching Origin", () => {
    // A page cannot forge Sec-Fetch-Site, so it wins over anything else.
    expect(
      isSameOriginRequest(signals({ secFetchSite: "cross-site", origin: EXPECTED })),
    ).toBe(false);
  });

  it("rejects same-site, because a sibling subdomain is a different origin", () => {
    expect(isSameOriginRequest(signals({ secFetchSite: "same-site" }))).toBe(false);
  });

  it("accepts same-origin", () => {
    expect(
      isSameOriginRequest(signals({ secFetchSite: "same-origin", origin: EXPECTED })),
    ).toBe(true);
  });

  it("accepts a user-initiated navigation", () => {
    // `none` means the address bar or a bookmark; a page cannot cause it.
    expect(isSameOriginRequest(signals({ secFetchSite: "none" }))).toBe(true);
  });

  it("rejects an unrecognised Sec-Fetch-Site value rather than guessing", () => {
    expect(isSameOriginRequest(signals({ secFetchSite: "somewhere-else" }))).toBe(false);
  });

  it("still requires the Origin to match when Fetch Metadata says same-origin", () => {
    expect(
      isSameOriginRequest(
        signals({ secFetchSite: "same-origin", origin: "https://evil.example" }),
      ),
    ).toBe(false);
  });

  it("does not regress an ordinary same-origin request with no extra headers", () => {
    // Same-origin fetch in some browsers omits Origin and Referer entirely.
    expect(isSameOriginRequest(signals({ secFetchSite: "same-origin" }))).toBe(true);
  });

  it("allows a non-browser caller that sends no headers at all", () => {
    // Mutations tolerate this: same-origin fetch legitimately omits Origin and
    // Referer in some browsers, and a caller with no Fetch Metadata is not the
    // CSRF threat model, which needs a browser carrying cookies.
    expect(isSameOriginRequest(signals())).toBe(true);
  });

  it("rejects when the expected origin itself is unusable", () => {
    expect(
      isSameOriginRequest(signals({ origin: EXPECTED, expectedOrigin: "garbage" })),
    ).toBe(false);
  });

  it("is case-insensitive about the Fetch Metadata value", () => {
    expect(isSameOriginRequest(signals({ secFetchSite: "Cross-Site" }))).toBe(false);
  });

  // ---- the stricter policy used by credential refresh ----

  describe("refresh policy — fails closed", () => {
    const refresh = { requireOriginSignal: true } as const;

    it("refuses a request that carries no origin signal at all", () => {
      // The difference from the mutation policy. This endpoint rotates
      // credentials from a top-level GET, so an absence is not treated as
      // evidence of a non-browser caller.
      expect(isSameOriginRequest(signals(), refresh)).toBe(false);
    });

    it("still refuses cross-site", () => {
      expect(isSameOriginRequest(signals({ secFetchSite: "cross-site" }), refresh)).toBe(
        false,
      );
    });

    it("still refuses same-site", () => {
      expect(isSameOriginRequest(signals({ secFetchSite: "same-site" }), refresh)).toBe(
        false,
      );
    });

    it("allows our own page", () => {
      expect(isSameOriginRequest(signals({ secFetchSite: "same-origin" }), refresh)).toBe(
        true,
      );
    });

    it("allows a direct user navigation", () => {
      expect(isSameOriginRequest(signals({ secFetchSite: "none" }), refresh)).toBe(true);
    });

    it("allows a matching Origin when Fetch Metadata is unavailable", () => {
      expect(isSameOriginRequest(signals({ origin: EXPECTED }), refresh)).toBe(true);
    });

    it("allows a matching Referer when Fetch Metadata is unavailable", () => {
      expect(isSameOriginRequest(signals({ referer: `${EXPECTED}/home` }), refresh)).toBe(
        true,
      );
    });

    it("refuses the same host on a different scheme", () => {
      expect(
        isSameOriginRequest(signals({ origin: "http://potriv.example" }), refresh),
      ).toBe(false);
    });

    it("refuses the same host on a different port", () => {
      expect(
        isSameOriginRequest(signals({ origin: "https://potriv.example:8443" }), refresh),
      ).toBe(false);
    });
  });
});
