import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may reach Skills.
 *
 * Everybody signed in, and no more than that. The catalogue is the organization's
 * shared vocabulary and the profile is the reader's own, so neither needs a role
 * — but an expired session must still not cause a read on somebody's behalf.
 */

const resolveProductSession = vi.fn();
const getSkillCategories = vi.fn();
const getSkills = vi.fn();
const getSkill = vi.fn();
const getOwnSkills = vi.fn();
const redirect = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("@/modules/skills/server/skillsDataSources", () => ({
  getSkillCategories,
  getSkills,
  getSkill,
  getOwnSkills,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirect(path);
    throw new Error("NEXT_REDIRECT");
  },
}));

const CataloguePage = (await import("../../../../app/(product)/(protected)/skills/page")).default;
const DetailPage = (await import("../../../../app/(product)/(protected)/skills/[skillId]/page"))
  .default;
const MyPage = (await import("../../../../app/(product)/(protected)/skills/my/page")).default;

const JAVA = "3e38e3cc-140c-4b89-a51d-a184c6e85700";

function sessionWith(...roles: string[]) {
  return { authenticated: true, user: { userId: "u-1", roles } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSkillCategories.mockResolvedValue({ ok: true, value: [] });
  getSkills.mockResolvedValue({ ok: true, value: [] });
  getSkill.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
  getOwnSkills.mockResolvedValue({ ok: true, value: [] });
});

async function renderAll() {
  await CataloguePage({ searchParams: Promise.resolve({}) });
  await DetailPage({ params: Promise.resolve({ skillId: JAVA }) });
  await MyPage();
}

describe("every authenticated role", () => {
  for (const roles of [
    ["EMPLOYEE"],
    ["EMPLOYEE", "PROJECT_MANAGER"],
    ["EMPLOYEE", "DEPARTMENT_MANAGER"],
    ["EMPLOYEE", "ORGANIZATION_ADMIN"],
    ["EMPLOYEE", "DEPARTMENT_MANAGER", "PROJECT_MANAGER", "ORGANIZATION_ADMIN"],
  ]) {
    it(`reaches all three routes as ${roles.join(" + ")}`, async () => {
      resolveProductSession.mockResolvedValue(sessionWith(...roles));

      await renderAll();

      expect(getSkillCategories).toHaveBeenCalled();
      expect(getSkill).toHaveBeenCalledWith(JAVA);
      // Called by both the detail page and the profile page.
      expect(getOwnSkills).toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });
  }
});

describe("an expired session", () => {
  beforeEach(() => {
    resolveProductSession.mockResolvedValue({ authenticated: false });
  });

  it("is sent to sign in from every route, and reads nothing first", async () => {
    for (const page of [
      () => CataloguePage({ searchParams: Promise.resolve({}) }),
      () => DetailPage({ params: Promise.resolve({ skillId: JAVA }) }),
      () => MyPage(),
    ]) {
      vi.clearAllMocks();

      await expect(page()).rejects.toThrow("NEXT_REDIRECT");

      expect(redirect).toHaveBeenCalledWith("/login?session=expired");
      expect(getSkillCategories).not.toHaveBeenCalled();
      expect(getSkills).not.toHaveBeenCalled();
      expect(getSkill).not.toHaveBeenCalled();
      expect(getOwnSkills).not.toHaveBeenCalled();
    }
  });
});
