import { describe, expect, it } from "vitest";

import { scrubbedUrl, tokenFromFragment } from "./credentialUrl";

/**
 * What must be gone from the address bar, and what must survive.
 *
 * The cases below are the four ways a link can arrive — fragment only, query
 * only, both, and a credential beside an ordinary parameter — because the bug
 * this replaces handled exactly one of them.
 */

const ORIGIN = "https://potriv.example";
const SECRET = "token-value-abc123";

describe("reading the token", () => {
  it("reads it from the fragment", () => {
    expect(tokenFromFragment(`#token=${SECRET}`)).toBe(SECRET);
    expect(tokenFromFragment(`token=${SECRET}`)).toBe(SECRET);
  });

  it("reads nothing when the fragment holds something else", () => {
    expect(tokenFromFragment("#section=intro")).toBe("");
    expect(tokenFromFragment("")).toBe("");
  });
});

describe("scrubbing the address bar", () => {
  it("removes a fragment token", () => {
    expect(scrubbedUrl(`${ORIGIN}/invite#token=${SECRET}`)).toBe("/invite");
  });

  it("removes a query token, which the page never accepted but did leave behind", () => {
    expect(scrubbedUrl(`${ORIGIN}/reset-password?token=${SECRET}`)).toBe("/reset-password");
  });

  it("removes both at once", () => {
    expect(scrubbedUrl(`${ORIGIN}/invite?token=${SECRET}#token=${SECRET}`)).toBe("/invite");
  });

  it("removes every credential parameter name", () => {
    const url = `${ORIGIN}/invite?token=a&inviteToken=b&resetToken=c`;
    expect(scrubbedUrl(url)).toBe("/invite");
  });

  it("removes a repeated credential parameter entirely", () => {
    expect(scrubbedUrl(`${ORIGIN}/invite?token=a&token=b`)).toBe("/invite");
  });

  it("keeps an ordinary parameter beside a credential", () => {
    const url = `${ORIGIN}/invite?from=email&token=${SECRET}#token=${SECRET}`;
    const scrubbed = scrubbedUrl(url);

    expect(scrubbed).toBe("/invite?from=email");
    expect(scrubbed).not.toContain(SECRET);
  });

  it("leaves a URL that never had a credential alone", () => {
    expect(scrubbedUrl(`${ORIGIN}/invite?from=email`)).toBe("/invite?from=email");
    expect(scrubbedUrl(`${ORIGIN}/invite`)).toBe("/invite");
  });

  it("returns a path-relative entry, so the origin is not restated", () => {
    expect(scrubbedUrl(`${ORIGIN}/invite#token=${SECRET}`)).not.toContain(ORIGIN);
  });
});
