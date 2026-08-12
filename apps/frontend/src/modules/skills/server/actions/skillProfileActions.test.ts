import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_SKILL_PROFILE_STATE } from "../../model/skillsActionState";

/**
 * The three self-service mutations, from the outside.
 *
 * Two contracts are load-bearing here. The vocabularies are closed, so a tampered
 * level or experience fails the request instead of being nudged into a valid
 * neighbour — recording a self-assessment somebody never made is the profile
 * version of the access-role lesson. And the *assignment* id is what mutations
 * take; sending a catalogue skill id would aim a profile edit at shared
 * organization data.
 */

const resolveProductSession = vi.fn();
const getSkill = vi.fn();
const getOwnSkills = vi.fn();
const assignOwnSkill = vi.fn();
const updateOwnSkill = vi.fn();
const removeOwnSkill = vi.fn();
const revalidatePath = vi.fn();

// Mocked so the profile actions can be proven never to reach them.
const createSkillCategory = vi.fn();
const updateSkillCategory = vi.fn();
const deactivateSkillCategory = vi.fn();
const createCatalogueSkill = vi.fn();
const updateCatalogueSkill = vi.fn();
const deactivateCatalogueSkill = vi.fn();
const linkSkillToCurrentDepartment = vi.fn();
const unlinkSkillFromCurrentDepartment = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("../skillsDataSources", () => ({
  getSkill,
  getOwnSkills,
  assignOwnSkill,
  updateOwnSkill,
  removeOwnSkill,
  createSkillCategory,
  updateSkillCategory,
  deactivateSkillCategory,
  createCatalogueSkill,
  updateCatalogueSkill,
  deactivateCatalogueSkill,
  linkSkillToCurrentDepartment,
  unlinkSkillFromCurrentDepartment,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const { assignOwnSkillAction, updateOwnSkillAction, removeOwnSkillAction } = await import(
  "./skillProfileActions"
);

const JAVA = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const ASSIGNMENT = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function skill(overrides: Record<string, unknown> = {}) {
  return {
    skillId: JAVA,
    category: { categoryId: "c-1", name: "Backend" },
    name: "Java",
    description: null,
    author: { userId: "u-1", name: "Ana", email: "ana@potriv.test" },
    departments: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function employeeSkill(overrides: Record<string, unknown> = {}) {
  return {
    employeeSkillId: ASSIGNMENT,
    skill: { skillId: JAVA, name: "Java", active: true, category: { categoryId: "c-1", name: "Backend" } },
    level: { code: "DOES", value: 3, label: "Does" },
    experience: { code: "ONE_TO_TWO_YEARS", label: "1-2 years" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const VALID_ADD = { skillId: JAVA, level: "DOES", experience: "ONE_TO_TWO_YEARS" };
const VALID_EDIT = {
  employeeSkillId: ASSIGNMENT,
  level: "HELPS",
  experience: "TWO_TO_FOUR_YEARS",
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveProductSession.mockResolvedValue({
    authenticated: true,
    user: { userId: "u-1", roles: ["EMPLOYEE"] },
  });
  getSkill.mockResolvedValue({ ok: true, value: skill() });
  getOwnSkills.mockResolvedValue({ ok: true, value: [employeeSkill()] });
  assignOwnSkill.mockResolvedValue({ ok: true, value: employeeSkill() });
  updateOwnSkill.mockResolvedValue({
    ok: true,
    value: employeeSkill({
      level: { code: "HELPS", value: 4, label: "Helps" },
      experience: { code: "TWO_TO_FOUR_YEARS", label: "2-4 years" },
    }),
  });
  removeOwnSkill.mockResolvedValue({ ok: true, value: undefined });
});

describe("adding a skill to my profile", () => {
  it("sends the catalogue id and the two chosen codes, and nothing else", async () => {
    await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    expect(assignOwnSkill).toHaveBeenCalledWith(JAVA, "DOES", "ONE_TO_TWO_YEARS");
    expect(assignOwnSkill.mock.calls[0]).toHaveLength(3);
  });

  it("re-reads the skill rather than trusting what the page said", async () => {
    await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    expect(getSkill).toHaveBeenCalledWith(JAVA);
  });

  it("adds a skill linked to no department", async () => {
    // The backend never checks department links on assign; inventing that rule
    // would hide skills people are entitled to add.
    getSkill.mockResolvedValue({ ok: true, value: skill({ departments: [] }) });

    const state = await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    expect(assignOwnSkill).toHaveBeenCalled();
    expect(state.error).toBeUndefined();
  });

  it("refreshes the profile, the skill and Home", async () => {
    await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    for (const path of ["/skills/my", "/home", `/skills/${JAVA}`]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });
});

describe("the add trust boundary", () => {
  async function expectRejected(fields: Record<string, string>) {
    const state = await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(fields));
    expect(assignOwnSkill).not.toHaveBeenCalled();
    return state;
  }

  it("refuses an unauthenticated caller before reading anything", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    await expectRejected(VALID_ADD);
    expect(getSkill).not.toHaveBeenCalled();
  });

  it("refuses a skill id that is not an identifier", async () => {
    for (const skillId of ["", "../skills", "not-a-uuid"]) {
      vi.clearAllMocks();
      await expectRejected({ ...VALID_ADD, skillId });
      expect(getSkill).not.toHaveBeenCalled();
    }
  });

  it("refuses a level outside the vocabulary, before reading the skill", async () => {
    for (const level of ["EXPERT", "does", "Does", "3", ""]) {
      vi.clearAllMocks();
      const state = await expectRejected({ ...VALID_ADD, level });
      expect(state.error).toBeDefined();
      expect(getSkill).not.toHaveBeenCalled();
    }
  });

  it("refuses an experience outside the vocabulary", async () => {
    for (const experience of ["TEN_YEARS", "1-2 years", "one_to_two_years", ""]) {
      vi.clearAllMocks();
      await expectRejected({ ...VALID_ADD, experience });
      expect(getSkill).not.toHaveBeenCalled();
    }
  });

  it("refuses a skill that is missing or not visible", async () => {
    for (const reason of ["NOT_FOUND", "FORBIDDEN"]) {
      vi.clearAllMocks();
      getSkill.mockResolvedValue({ ok: false, reason });

      const state = await expectRejected(VALID_ADD);
      expect(state.error).toBe("This skill does not exist or is not visible to you.");
    }
  });

  it("refuses a skill deactivated since the page rendered", async () => {
    getSkill.mockResolvedValue({ ok: true, value: skill({ active: false }) });

    const state = await expectRejected(VALID_ADD);
    expect(state.error).toContain("inactive");
  });
});

describe("a duplicate the backend caught", () => {
  it("reports it without claiming success or creating a second row", async () => {
    assignOwnSkill.mockResolvedValue({
      ok: false,
      status: 409,
      detail: "You have already assigned this skill.",
    });

    const state = await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    expect(assignOwnSkill).toHaveBeenCalledTimes(1);
    expect(state.error).toContain("already assigned");
    expect(state.done).toBeUndefined();
  });

  it("refreshes so the screen catches up with what is really there", async () => {
    assignOwnSkill.mockResolvedValue({ ok: false, status: 409, detail: null });

    await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    expect(revalidatePath).toHaveBeenCalledWith("/skills/my");
    expect(revalidatePath).toHaveBeenCalledWith(`/skills/${JAVA}`);
  });
});

describe("editing my assignment", () => {
  it("uses the assignment id, never the catalogue skill id", async () => {
    await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT));

    expect(updateOwnSkill).toHaveBeenCalledWith(ASSIGNMENT, "HELPS", "TWO_TO_FOUR_YEARS");
    expect(updateOwnSkill).not.toHaveBeenCalledWith(JAVA, expect.anything(), expect.anything());
  });

  it("sends both fields, and no identity fields", async () => {
    await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT));

    // The call signature carries an id and the two codes — nothing about the
    // skill or the owner can ride along.
    expect(updateOwnSkill.mock.calls[0]).toHaveLength(3);
  });

  it("proves ownership from a fresh self list", async () => {
    await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT));

    expect(getOwnSkills).toHaveBeenCalledTimes(1);
  });
});

describe("the edit trust boundary", () => {
  async function expectRejected(fields: Record<string, string>) {
    const state = await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(fields));
    expect(updateOwnSkill).not.toHaveBeenCalled();
    return state;
  }

  it("refuses an assignment id that is not an identifier", async () => {
    for (const employeeSkillId of ["", "../me", "not-a-uuid"]) {
      vi.clearAllMocks();
      await expectRejected({ ...VALID_EDIT, employeeSkillId });
    }
  });

  it("refuses unknown level or experience before reading the list", async () => {
    vi.clearAllMocks();
    await expectRejected({ ...VALID_EDIT, level: "EXPERT" });
    expect(getOwnSkills).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await expectRejected({ ...VALID_EDIT, experience: "TEN_YEARS" });
    expect(getOwnSkills).not.toHaveBeenCalled();
  });

  it("refuses an assignment the fresh list does not contain", async () => {
    // Removed in another tab, or never this person's — same answer, and nothing
    // is recreated.
    getOwnSkills.mockResolvedValue({ ok: true, value: [] });

    const state = await expectRejected(VALID_EDIT);

    expect(state.error).toBe(
      "This skill assignment no longer exists or is not visible to you.",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/skills/my");
  });

  it("says nothing about whose assignment it might be", async () => {
    getOwnSkills.mockResolvedValue({ ok: true, value: [] });

    const state = await expectRejected(VALID_EDIT);

    expect(state.error).not.toMatch(/someone else|another user|belongs to/i);
  });
});

describe("removing my assignment", () => {
  it("deletes by assignment id after confirming it is mine", async () => {
    await removeOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form({ employeeSkillId: ASSIGNMENT }));

    expect(getOwnSkills).toHaveBeenCalledTimes(1);
    expect(removeOwnSkill).toHaveBeenCalledWith(ASSIGNMENT);
  });

  it("says what was removed, and leaves the catalogue alone", async () => {
    const state = await removeOwnSkillAction(
      EMPTY_SKILL_PROFILE_STATE,
      form({ employeeSkillId: ASSIGNMENT }),
    );

    expect(state.done).toContain("removed from your skills");
    expect(state.done).not.toMatch(/deleted|catalogue/i);
  });

  it("refuses an assignment the fresh list does not contain", async () => {
    getOwnSkills.mockResolvedValue({ ok: true, value: [] });

    const state = await removeOwnSkillAction(
      EMPTY_SKILL_PROFILE_STATE,
      form({ employeeSkillId: ASSIGNMENT }),
    );

    expect(removeOwnSkill).not.toHaveBeenCalled();
    expect(state.error).toContain("no longer exists");
  });

  it("refuses an id that is not an identifier", async () => {
    for (const employeeSkillId of ["", "../me", "not-a-uuid"]) {
      vi.clearAllMocks();
      await removeOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form({ employeeSkillId }));
      expect(removeOwnSkill).not.toHaveBeenCalled();
      expect(getOwnSkills).not.toHaveBeenCalled();
    }
  });
});

describe("the catalogue is never touched", () => {
  /**
   * Catalogue administration now exists in this module, so the old assertion —
   * that no such data source is exported at all — no longer holds and should not.
   * What must still hold is narrower and more useful: *these three actions* only
   * ever touch the caller's own profile, whatever else the module can do.
   */
  it("performs no catalogue mutation while managing a profile", async () => {
    await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));
    await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT));
    await removeOwnSkillAction(
      EMPTY_SKILL_PROFILE_STATE,
      form({ employeeSkillId: ASSIGNMENT }),
    );

    for (const forbidden of [
      createSkillCategory,
      updateSkillCategory,
      deactivateSkillCategory,
      createCatalogueSkill,
      updateCatalogueSkill,
      deactivateCatalogueSkill,
      linkSkillToCurrentDepartment,
      unlinkSkillFromCurrentDepartment,
    ]) {
      expect(forbidden).not.toHaveBeenCalled();
    }
  });

  it("imports no catalogue mutation into the profile action module", async () => {
    // Structural: the file's own import list, so a future edit that reached for
    // one of these would have to add it here first.
    // Path from the vitest root rather than `import.meta.url`, which the
    // transform does not give as a file URL.
    const source = await readFile(
      "src/modules/skills/server/actions/skillProfileActions.ts",
      "utf8",
    );
    const imports = source.slice(0, source.indexOf("const UUID"));

    for (const forbidden of [
      "createSkillCategory",
      "updateSkillCategory",
      "deactivateSkillCategory",
      "createCatalogueSkill",
      "updateCatalogueSkill",
      "deactivateCatalogueSkill",
      "linkSkillToCurrentDepartment",
      "unlinkSkillFromCurrentDepartment",
    ]) {
      expect(imports).not.toContain(forbidden);
    }
  });
});

describe("a wordless failure names the right object", () => {
  /**
   * The backend normally sends a usable sentence. When it does not — no body, or
   * one the sanitizer refuses — the fallback has to know which object the caller
   * was acting on: a catalogue skill for an add, one of their own assignments for
   * an edit or a removal.
   */
  it("says the skill for a failed add", async () => {
    assignOwnSkill.mockResolvedValue({ ok: false, status: 404, detail: null });

    const state = await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD));

    expect(state.error).toBe("This skill does not exist or is not visible to you.");
  });

  it("says the assignment for a failed edit", async () => {
    updateOwnSkill.mockResolvedValue({ ok: false, status: 404, detail: null });

    const state = await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT));

    expect(state.error).toBe(
      "This skill assignment no longer exists or is not visible to you.",
    );
  });

  it("says the assignment for a failed removal", async () => {
    removeOwnSkill.mockResolvedValue({ ok: false, status: 404, detail: null });

    const state = await removeOwnSkillAction(
      EMPTY_SKILL_PROFILE_STATE,
      form({ employeeSkillId: ASSIGNMENT }),
    );

    expect(state.error).toBe(
      "This skill assignment no longer exists or is not visible to you.",
    );
  });

  it("calls nothing a duplicate except an add", async () => {
    // A conflict on an edit or a removal is some other collision entirely.
    updateOwnSkill.mockResolvedValue({ ok: false, status: 409, detail: null });
    removeOwnSkill.mockResolvedValue({ ok: false, status: 409, detail: null });

    for (const state of [
      await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT)),
      await removeOwnSkillAction(
        EMPTY_SKILL_PROFILE_STATE,
        form({ employeeSkillId: ASSIGNMENT }),
      ),
    ]) {
      expect(state.error).not.toMatch(/already in your profile/);
      expect(state.error).toBe("Something went wrong. Try again.");
    }
  });

  it("still prefers the backend's own sentence when there is one", async () => {
    updateOwnSkill.mockResolvedValue({
      ok: false,
      status: 404,
      detail: "Skill assignment was not found.",
    });

    const state = await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT));

    expect(state.error).toBe("Skill assignment was not found.");
  });
});

describe("what crosses back to the browser", () => {
  const LEAKS = [
    "Bearer",
    "Authorization",
    "accessToken",
    "refreshToken",
    "localhost:8080",
    "/api/",
    "/me/skills",
    "Exception",
    "timestamp",
  ];

  it("carries no token, header, backend path or envelope on any failure", async () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      assignOwnSkill.mockResolvedValue({ ok: false, status, detail: null });
      updateOwnSkill.mockResolvedValue({ ok: false, status, detail: null });
      removeOwnSkill.mockResolvedValue({ ok: false, status, detail: null });

      for (const state of [
        await assignOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_ADD)),
        await updateOwnSkillAction(EMPTY_SKILL_PROFILE_STATE, form(VALID_EDIT)),
        await removeOwnSkillAction(
          EMPTY_SKILL_PROFILE_STATE,
          form({ employeeSkillId: ASSIGNMENT }),
        ),
      ]) {
        const serialized = JSON.stringify(state);
        for (const leak of LEAKS) expect(serialized).not.toContain(leak);
      }
    }
  });
});
