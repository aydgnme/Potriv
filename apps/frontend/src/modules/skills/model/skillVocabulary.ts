/**
 * The two closed vocabularies an employee skill is described with.
 *
 * Both mirror backend enums exactly. The codes are what gets sent; the labels are
 * what gets shown; and neither is derived from the other or from position in an
 * array — a reordering of these lists must not silently change what "level 3"
 * means.
 *
 * `LEARNS … TEACHES` is not a severity scale and not a rating. Team Finder's
 * ranking does not weight either field, so nothing here is coloured, starred or
 * sorted by "how good" somebody is. They are self-reported context.
 */

export type SkillLevelCode = "LEARNS" | "KNOWS" | "DOES" | "HELPS" | "TEACHES";

export type SkillLevelOption = {
  readonly code: SkillLevelCode;
  /** The backend's own 1–5, carried because it is contract — not to draw stars. */
  readonly value: number;
  readonly label: string;
};

/** Written out rather than generated, so the value belongs to the code. */
export const SKILL_LEVELS: readonly SkillLevelOption[] = [
  { code: "LEARNS", value: 1, label: "Learns" },
  { code: "KNOWS", value: 2, label: "Knows" },
  { code: "DOES", value: 3, label: "Does" },
  { code: "HELPS", value: 4, label: "Helps" },
  { code: "TEACHES", value: 5, label: "Teaches" },
];

export type SkillExperienceCode =
  | "ZERO_TO_SIX_MONTHS"
  | "SIX_TO_TWELVE_MONTHS"
  | "ONE_TO_TWO_YEARS"
  | "TWO_TO_FOUR_YEARS"
  | "FOUR_TO_SEVEN_YEARS"
  | "MORE_THAN_SEVEN_YEARS";

export type SkillExperienceOption = {
  readonly code: SkillExperienceCode;
  readonly label: string;
};

/**
 * Buckets, not a number of months.
 *
 * The backend stores the bucket, so nothing here converts to years or infers a
 * midpoint — that would report precision nobody entered.
 */
export const SKILL_EXPERIENCES: readonly SkillExperienceOption[] = [
  { code: "ZERO_TO_SIX_MONTHS", label: "0-6 months" },
  { code: "SIX_TO_TWELVE_MONTHS", label: "6-12 months" },
  { code: "ONE_TO_TWO_YEARS", label: "1-2 years" },
  { code: "TWO_TO_FOUR_YEARS", label: "2-4 years" },
  { code: "FOUR_TO_SEVEN_YEARS", label: "4-7 years" },
  { code: "MORE_THAN_SEVEN_YEARS", label: ">7 years" },
];

const LEVEL_CODES = new Set<string>(SKILL_LEVELS.map((level) => level.code));
const EXPERIENCE_CODES = new Set<string>(
  SKILL_EXPERIENCES.map((experience) => experience.code),
);

/**
 * Exact codes only — no trimming, no case folding, no nearest match.
 *
 * These run on the server over form input. A value outside the vocabulary makes
 * the submission invalid rather than being coerced into a neighbouring one: this
 * is somebody's self-declared profile, and quietly recording a level they did not
 * choose is worse than refusing the request.
 */
export function parseSkillLevel(raw: unknown): SkillLevelCode | null {
  return typeof raw === "string" && LEVEL_CODES.has(raw) ? (raw as SkillLevelCode) : null;
}

export function parseSkillExperience(raw: unknown): SkillExperienceCode | null {
  return typeof raw === "string" && EXPERIENCE_CODES.has(raw)
    ? (raw as SkillExperienceCode)
    : null;
}
