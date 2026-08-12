"use server";

import { revalidatePath } from "next/cache";

import { resolveProductSession } from "@/modules/auth/server/productSession";

import type { SkillProfileActionState } from "../../model/skillsActionState";
import { parseSkillExperience, parseSkillLevel } from "../../model/skillVocabulary";
import {
  assignOwnSkill,
  getOwnSkills,
  getSkill,
  removeOwnSkill,
  updateOwnSkill,
} from "../skillsDataSources";

/**
 * The three things somebody may do to their own skill profile.
 *
 * All of it is self-scoped — `/me/skills` has no user id in the path — so the
 * fresh read of that list *is* the ownership proof. An assignment id that is not
 * in it belongs to somebody else or to nobody, and both get the same sentence.
 *
 * Level and experience are closed vocabularies checked exactly, before anything
 * is read. Coercing an unknown code into a neighbouring one would record a
 * self-assessment the person never made, which is the profile equivalent of the
 * access-role lesson: a malformed request must fail, not become a different valid
 * one.
 *
 * Nothing here touches the catalogue. There is no create, edit, deactivate or
 * department-link call in this module at all — removing an assignment removes one
 * row from one profile and leaves the shared vocabulary exactly as it was.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK = {
  // The catalogue entry, and a person's assignment to it, are different objects —
  // so they get different sentences, and neither says which of missing or
  // not-visible applies.
  SKILL_UNAVAILABLE: "This skill does not exist or is not visible to you.",
  ASSIGNMENT_UNAVAILABLE: "This skill assignment no longer exists or is not visible to you.",
  VALIDATION: "That selection was not accepted. Choose a level and experience and try again.",
  INACTIVE: "This catalogue skill is inactive and cannot be added.",
  DUPLICATE: "This skill is already in your profile.",
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  SERVER: "Something went wrong. Try again.",
} as const;

/**
 * Which object a failure is about.
 *
 * `assign` acts on a catalogue skill; `profile` acts on one of the caller's own
 * assignments. It matters for the wordless cases: a 404 with no usable body
 * means "that skill" for one and "that assignment" for the other, and a shared
 * fallback would have edit and remove apologise for the wrong thing whenever the
 * backend sent no message or the sanitizer rejected the one it did send.
 */
type MutationKind = "assign" | "profile";

function mutationMessage(
  operation: MutationKind,
  status: number,
  detail: string | null,
): string {
  if (detail !== null) return detail;
  if (status === 400 || status === 422) return FALLBACK.VALIDATION;
  if (status === 401) return FALLBACK.UNAUTHENTICATED;
  if (status === 404) {
    return operation === "assign" ? FALLBACK.SKILL_UNAVAILABLE : FALLBACK.ASSIGNMENT_UNAVAILABLE;
  }
  // Only assignment can collide; a conflict on an edit or a removal is not a
  // duplicate and must not be described as one.
  if (status === 409 && operation === "assign") return FALLBACK.DUPLICATE;
  return FALLBACK.SERVER;
}

async function requireSession(): Promise<boolean> {
  const session = await resolveProductSession();
  return session.authenticated;
}

/** Home shows a skill-profile summary, so it re-reads too. */
function refreshProfile(skillId?: string): void {
  revalidatePath("/skills/my");
  revalidatePath("/home");
  if (skillId) revalidatePath(`/skills/${skillId}`);
}

/**
 * Adding a catalogue skill to the caller's own profile.
 *
 * The skill is re-read rather than trusted: the page may have rendered before it
 * was deactivated, and "active" arriving from a browser is not evidence. Being
 * linked to a department is *not* checked, because the backend does not check it
 * either — inventing that rule here would hide skills people are entitled to add.
 */
export async function assignOwnSkillAction(
  _previous: SkillProfileActionState,
  formData: FormData,
): Promise<SkillProfileActionState> {
  if (!(await requireSession())) return { error: FALLBACK.UNAUTHENTICATED };

  const skillId = formData.get("skillId");
  if (typeof skillId !== "string" || !UUID.test(skillId)) {
    return { error: FALLBACK.SKILL_UNAVAILABLE };
  }

  const level = parseSkillLevel(formData.get("level"));
  const experience = parseSkillExperience(formData.get("experience"));
  if (level === null || experience === null) {
    return { error: FALLBACK.VALIDATION };
  }

  const fresh = await getSkill(skillId);
  if (!fresh.ok) {
    return { error: fresh.reason === "ERROR" ? FALLBACK.SERVER : FALLBACK.SKILL_UNAVAILABLE };
  }
  if (!fresh.value.active) {
    return { error: FALLBACK.INACTIVE };
  }

  const assigned = await assignOwnSkill(skillId, level, experience);
  if (!assigned.ok) {
    // A duplicate can still win the race between the read and the write; the
    // backend stays the authority and its refusal is reported as a refusal.
    refreshProfile(skillId);
    return { error: mutationMessage("assign", assigned.status, assigned.detail) };
  }

  refreshProfile(skillId);

  return { done: `${assigned.value.skill.name} was added to your skills.` };
}

/**
 * Changing the level or experience on an existing assignment.
 *
 * The assignment is looked up in a fresh self list first, which proves both that
 * it still exists and that it is the caller's. Only then is the id put in a path.
 */
export async function updateOwnSkillAction(
  _previous: SkillProfileActionState,
  formData: FormData,
): Promise<SkillProfileActionState> {
  if (!(await requireSession())) return { error: FALLBACK.UNAUTHENTICATED };

  const employeeSkillId = formData.get("employeeSkillId");
  if (typeof employeeSkillId !== "string" || !UUID.test(employeeSkillId)) {
    return { error: FALLBACK.ASSIGNMENT_UNAVAILABLE };
  }

  const level = parseSkillLevel(formData.get("level"));
  const experience = parseSkillExperience(formData.get("experience"));
  if (level === null || experience === null) {
    return { error: FALLBACK.VALIDATION };
  }

  const own = await getOwnSkills();
  if (!own.ok) return { error: FALLBACK.SERVER };

  const existing = own.value.find((entry) => entry.employeeSkillId === employeeSkillId);
  if (!existing) {
    // Removed in another tab, or never the caller's. Same answer either way, and
    // nothing is recreated.
    refreshProfile();
    return { error: FALLBACK.ASSIGNMENT_UNAVAILABLE };
  }

  const saved = await updateOwnSkill(employeeSkillId, level, experience);
  if (!saved.ok) {
    return { error: mutationMessage("profile", saved.status, saved.detail) };
  }

  refreshProfile(saved.value.skill.skillId);

  return { done: `${saved.value.skill.name} was updated.` };
}

/**
 * Removing one assignment from the caller's own profile.
 *
 * The catalogue skill survives this, and so does everybody else's assignment to
 * it. The same fresh-list check applies, so a stale id never reaches a DELETE.
 */
export async function removeOwnSkillAction(
  _previous: SkillProfileActionState,
  formData: FormData,
): Promise<SkillProfileActionState> {
  if (!(await requireSession())) return { error: FALLBACK.UNAUTHENTICATED };

  const employeeSkillId = formData.get("employeeSkillId");
  if (typeof employeeSkillId !== "string" || !UUID.test(employeeSkillId)) {
    return { error: FALLBACK.ASSIGNMENT_UNAVAILABLE };
  }

  const own = await getOwnSkills();
  if (!own.ok) return { error: FALLBACK.SERVER };

  const existing = own.value.find((entry) => entry.employeeSkillId === employeeSkillId);
  if (!existing) {
    refreshProfile();
    return { error: FALLBACK.ASSIGNMENT_UNAVAILABLE };
  }

  const removed = await removeOwnSkill(employeeSkillId);
  if (!removed.ok) {
    return { error: mutationMessage("profile", removed.status, removed.detail) };
  }

  refreshProfile(existing.skill.skillId);

  return { done: `${existing.skill.name} was removed from your skills.` };
}
