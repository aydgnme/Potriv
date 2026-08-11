import { describe, expect, it } from "vitest";

import {
  catalogueHref,
  isFiltered,
  normalizeCatalogueQuery,
  readCatalogueMode,
} from "./catalogueQuery";
import type { SkillCategory } from "./skillsData";
import {
  SKILL_EXPERIENCES,
  SKILL_LEVELS,
  parseSkillExperience,
  parseSkillLevel,
} from "./skillVocabulary";

/**
 * The rules the Skills screens are built on, checked without a backend.
 *
 * Two carry most of the weight: a filter must never claim one thing while asking
 * the backend for another, and the two vocabularies are closed — an unknown code
 * is refused rather than nudged into a neighbouring value somebody never chose.
 */

const PLATFORM = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const RETIRED = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function category(categoryId: string, name: string, active = true): SkillCategory {
  return {
    categoryId,
    name,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

describe("the level vocabulary", () => {
  it("is the backend's five codes, with their own values", () => {
    // Written out rather than derived: reordering this list must not silently
    // change what a level means.
    expect(SKILL_LEVELS).toEqual([
      { code: "LEARNS", value: 1, label: "Learns" },
      { code: "KNOWS", value: 2, label: "Knows" },
      { code: "DOES", value: 3, label: "Does" },
      { code: "HELPS", value: 4, label: "Helps" },
      { code: "TEACHES", value: 5, label: "Teaches" },
    ]);
  });

  it("does not derive a value from position", () => {
    SKILL_LEVELS.forEach((option, index) => {
      expect(option.value).toBe(index + 1);
    });
    // And the pairing survives a reversed copy, which an index-derived value
    // would not.
    const reversed = [...SKILL_LEVELS].reverse();
    expect(reversed[0]).toEqual({ code: "TEACHES", value: 5, label: "Teaches" });
  });

  it("uses no rating language", () => {
    const labels = SKILL_LEVELS.map((option) => option.label).join(" ");
    for (const forbidden of ["Beginner", "Intermediate", "Advanced", "Expert", "Novice"]) {
      expect(labels).not.toContain(forbidden);
    }
  });

  it("accepts exactly the five codes", () => {
    for (const option of SKILL_LEVELS) {
      expect(parseSkillLevel(option.code)).toBe(option.code);
    }
  });

  it("refuses anything else, including near misses", () => {
    for (const raw of ["EXPERT", "teaches", "Teaches", " DOES", "DOES ", "", "3", null, 3]) {
      expect(parseSkillLevel(raw)).toBeNull();
    }
  });
});

describe("the experience vocabulary", () => {
  it("is the backend's six buckets", () => {
    expect(SKILL_EXPERIENCES).toEqual([
      { code: "ZERO_TO_SIX_MONTHS", label: "0-6 months" },
      { code: "SIX_TO_TWELVE_MONTHS", label: "6-12 months" },
      { code: "ONE_TO_TWO_YEARS", label: "1-2 years" },
      { code: "TWO_TO_FOUR_YEARS", label: "2-4 years" },
      { code: "FOUR_TO_SEVEN_YEARS", label: "4-7 years" },
      { code: "MORE_THAN_SEVEN_YEARS", label: ">7 years" },
    ]);
  });

  it("accepts exactly the six codes", () => {
    for (const option of SKILL_EXPERIENCES) {
      expect(parseSkillExperience(option.code)).toBe(option.code);
    }
  });

  it("refuses labels, near misses and invented buckets", () => {
    // The form sends codes; a label arriving instead is a tampered submission.
    for (const raw of [
      "0-6 months",
      "1-2 years",
      "zero_to_six_months",
      "MORE_THAN_7_YEARS",
      "TEN_YEARS",
      " ONE_TO_TWO_YEARS ",
      "",
      null,
    ]) {
      expect(parseSkillExperience(raw)).toBeNull();
    }
  });
});

describe("reading the catalogue mode", () => {
  it("trims a query and drops a blank one", () => {
    expect(readCatalogueMode({ q: "  java  " }).q).toBe("java");
    expect(readCatalogueMode({ q: "   " }).q).toBeUndefined();
    expect(readCatalogueMode({}).q).toBeUndefined();
  });

  it("treats only the literal true as show-inactive", () => {
    expect(readCatalogueMode({ includeInactive: "true" }).includeInactive).toBe(true);
    for (const raw of ["false", "banana", "TRUE", "1", "", undefined]) {
      expect(readCatalogueMode({ includeInactive: raw }).includeInactive).toBe(false);
    }
  });

  it("drops a category that is not even a UUID, before any request", () => {
    for (const raw of ["", "../skills", "not-a-uuid", "1 OR 1=1"]) {
      expect(readCatalogueMode({ categoryId: raw }).requestedCategoryId).toBeUndefined();
    }
  });

  it("keeps a well-formed category for checking", () => {
    expect(readCatalogueMode({ categoryId: PLATFORM }).requestedCategoryId).toBe(PLATFORM);
  });

  it("takes the first value when a parameter repeats", () => {
    expect(readCatalogueMode({ q: ["java", "go"] }).q).toBe("java");
  });
});

describe("settling the category against what exists", () => {
  const categories = [category(PLATFORM, "Platform")];

  it("keeps a category the organization has", () => {
    expect(normalizeCatalogueQuery({ categoryId: PLATFORM }, categories).categoryId).toBe(
      PLATFORM,
    );
  });

  it("drops a well-formed id for a category that does not exist", () => {
    // Otherwise the sidebar would say "All skills" while the request was filtered.
    const query = normalizeCatalogueQuery({ categoryId: RETIRED }, categories);
    expect(query.categoryId).toBeUndefined();
  });

  it("drops an inactive category while the toggle is off", () => {
    // The category source was loaded active-only, so this id is not among them.
    const activeOnly = [category(PLATFORM, "Platform")];
    const query = normalizeCatalogueQuery({ categoryId: RETIRED }, activeOnly);
    expect(query.categoryId).toBeUndefined();
  });

  it("keeps an inactive category once it has been asked for", () => {
    const withInactive = [category(PLATFORM, "Platform"), category(RETIRED, "Retired", false)];
    const query = normalizeCatalogueQuery(
      { categoryId: RETIRED, includeInactive: "true" },
      withInactive,
    );

    expect(query.categoryId).toBe(RETIRED);
    expect(query.includeInactive).toBe(true);
  });

  it("carries the trimmed query through", () => {
    expect(normalizeCatalogueQuery({ q: "  java " }, categories).q).toBe("java");
  });
});

describe("knowing whether anything is filtered", () => {
  it("counts a search and a category, but not the inactive mode", () => {
    expect(isFiltered({ includeInactive: false })).toBe(false);
    // Showing inactive widens the list rather than narrowing it, so an empty
    // result with it on is still "nothing here yet", not "nothing matched".
    expect(isFiltered({ includeInactive: true })).toBe(false);
    expect(isFiltered({ q: "java", includeInactive: false })).toBe(true);
    expect(isFiltered({ categoryId: PLATFORM, includeInactive: false })).toBe(true);
  });
});

describe("building a catalogue link", () => {
  it("omits everything that is not set", () => {
    expect(catalogueHref({ includeInactive: false })).toBe("/skills");
  });

  it("carries the settled values", () => {
    expect(catalogueHref({ q: "java", categoryId: PLATFORM, includeInactive: true })).toBe(
      `/skills?q=java&categoryId=${PLATFORM}&includeInactive=true`,
    );
  });

  it("escapes a query that would otherwise break the URL", () => {
    expect(catalogueHref({ q: "c++ & rust", includeInactive: false })).toBe(
      "/skills?q=c%2B%2B+%26+rust",
    );
  });
});
