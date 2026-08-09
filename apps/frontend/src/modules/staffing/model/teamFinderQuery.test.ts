import { describe, expect, it } from "vitest";

import {
  normalizeTeamFinderQuery,
  teamFinderHref,
  toRequestBody,
} from "./teamFinderQuery";

/**
 * The criteria a URL is allowed to express.
 *
 * The backend refuses a window outside 2..6 weeks and a limit outside 1..100
 * with a 400, so a mistyped or hand-edited URL must not become an error the
 * person cannot act on. Anything unrecognised is dropped and the backend applies
 * its own default instead.
 */

describe("normalizeTeamFinderQuery", () => {
  it("defaults everything off, with no limit of its own", () => {
    expect(normalizeTeamFinderQuery({})).toEqual({
      includePartiallyAvailable: false,
      includeCloseToFinish: false,
      closeToFinishWeeks: null,
      includeUnavailable: false,
      limit: null,
    });
  });

  it("turns a flag on only for the literal true", () => {
    expect(normalizeTeamFinderQuery({ includePartiallyAvailable: "true" })
      .includePartiallyAvailable).toBe(true);

    for (const value of ["banana", "1", "yes", "TRUE", "", "false"]) {
      expect(
        normalizeTeamFinderQuery({ includePartiallyAvailable: value })
          .includePartiallyAvailable,
      ).toBe(false);
    }
  });

  it("keeps a close-to-finish window inside the range the backend accepts", () => {
    for (const weeks of [2, 3, 4, 5, 6]) {
      expect(
        normalizeTeamFinderQuery({
          includeCloseToFinish: "true",
          closeToFinishWeeks: String(weeks),
        }).closeToFinishWeeks,
      ).toBe(weeks);
    }
  });

  it("drops a window outside the range rather than sending a 400", () => {
    for (const weeks of ["0", "1", "7", "99", "-3", "2.5", "many"]) {
      expect(
        normalizeTeamFinderQuery({
          includeCloseToFinish: "true",
          closeToFinishWeeks: weeks,
        }).closeToFinishWeeks,
      ).toBeNull();
    }
  });

  it("ignores a window when close-to-finish is off, because it means nothing there", () => {
    expect(
      normalizeTeamFinderQuery({ closeToFinishWeeks: "4" }).closeToFinishWeeks,
    ).toBeNull();
  });

  it("keeps a limit inside 1..100", () => {
    for (const limit of [1, 20, 50, 100]) {
      expect(normalizeTeamFinderQuery({ limit: String(limit) }).limit).toBe(limit);
    }
  });

  it("drops a limit outside the range", () => {
    for (const limit of ["0", "-1", "101", "500", "12.5", "", "lots"]) {
      expect(normalizeTeamFinderQuery({ limit }).limit).toBeNull();
    }
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(normalizeTeamFinderQuery({ limit: ["20", "99"] }).limit).toBe(20);
  });
});

describe("toRequestBody", () => {
  it("sends nothing at all when nothing was asked for", () => {
    // Every default then comes from the backend, and its echo says so.
    expect(toRequestBody(normalizeTeamFinderQuery({}))).toEqual({});
  });

  it("sends only the flags that are on", () => {
    expect(
      toRequestBody(
        normalizeTeamFinderQuery({ includePartiallyAvailable: "true", limit: "20" }),
      ),
    ).toEqual({ includePartiallyAvailable: true, limit: 20 });
  });

  it("sends a window only alongside the flag it belongs to", () => {
    expect(
      toRequestBody(
        normalizeTeamFinderQuery({ includeCloseToFinish: "true", closeToFinishWeeks: "4" }),
      ),
    ).toEqual({ includeCloseToFinish: true, closeToFinishWeeks: 4 });

    // Flag on, window rejected: the backend picks the window.
    expect(
      toRequestBody(
        normalizeTeamFinderQuery({ includeCloseToFinish: "true", closeToFinishWeeks: "99" }),
      ),
    ).toEqual({ includeCloseToFinish: true });
  });

  it("never carries a value the backend would refuse", () => {
    const body = toRequestBody(
      normalizeTeamFinderQuery({
        includeCloseToFinish: "true",
        closeToFinishWeeks: "42",
        limit: "9999",
        includeUnavailable: "maybe",
      }),
    );

    expect(body.closeToFinishWeeks).toBeUndefined();
    expect(body.limit).toBeUndefined();
    expect(body.includeUnavailable).toBeUndefined();
  });
});

describe("teamFinderHref", () => {
  it("is bare when nothing was chosen", () => {
    expect(teamFinderHref("p1", normalizeTeamFinderQuery({}))).toBe("/projects/p1/team-finder");
  });

  it("round-trips what it expresses", () => {
    const criteria = normalizeTeamFinderQuery({
      includePartiallyAvailable: "true",
      includeCloseToFinish: "true",
      closeToFinishWeeks: "4",
      includeUnavailable: "true",
      limit: "20",
    });

    const href = teamFinderHref("p1", criteria);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);

    expect(normalizeTeamFinderQuery(params)).toEqual(criteria);
  });
});
