/**
 * What a self-service Server Action hands back to the browser.
 *
 * Outside the `"use server"` files, which may only export async functions.
 *
 * Every field is product wording: no status code, no backend path, no envelope.
 * A couple of backend sentences are safe and useful — "You have already assigned
 * this skill" — and those are mapped deliberately rather than passed through.
 */

export type SkillProfileActionState = {
  readonly error?: string;
  readonly done?: string;
};

export const EMPTY_SKILL_PROFILE_STATE: SkillProfileActionState = {};
