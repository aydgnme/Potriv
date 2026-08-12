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

/**
 * What a catalogue-administration action hands back.
 *
 * Wider than the self-service state because these are forms: field errors and the
 * entered values come back so a rejected submission can be corrected rather than
 * retyped. Still product wording only.
 */
export type SkillAdminActionState = {
  readonly error?: string;
  readonly done?: string;
  readonly fieldErrors?: {
    readonly categoryId?: string;
    readonly name?: string;
    readonly description?: string;
  };
  readonly categoryId?: string;
  readonly name?: string;
  readonly description?: string;
};

export const EMPTY_SKILL_ADMIN_STATE: SkillAdminActionState = {};
