import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may reach team-role administration, and the skill-admin surfaces.
 *
 * Different roles, and the point of the test is that a refusal costs the backend
 * nothing: somebody without the role must cause no privileged call, not one whose
 * answer gets discarded.
 */

const resolveProductSession = vi.fn();
const getTeamRoles = vi.fn();
const getTeamRole = vi.fn();
const getSkillCategories = vi.fn();
const getSkill = vi.fn();
const getSkills = vi.fn();
const getOwnSkills = vi.fn();
const getManagedDepartment = vi.fn();
const redirect = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("@/modules/teamRoles/server/teamRoleDataSources", () => ({
  getTeamRoles,
  getTeamRole,
  createTeamRole: vi.fn(),
  updateTeamRole: vi.fn(),
  deactivateTeamRole: vi.fn(),
}));
vi.mock("@/modules/skills/server/skillsDataSources", () => ({
  getSkillCategories,
  getSkill,
  getSkills,
  getOwnSkills,
  getManagedDepartment,
  createSkillCategory: vi.fn(),
  updateSkillCategory: vi.fn(),
  deactivateSkillCategory: vi.fn(),
  createCatalogueSkill: vi.fn(),
  updateCatalogueSkill: vi.fn(),
  deactivateCatalogueSkill: vi.fn(),
  linkSkillToCurrentDepartment: vi.fn(),
  unlinkSkillFromCurrentDepartment: vi.fn(),
  assignOwnSkill: vi.fn(),
  updateOwnSkill: vi.fn(),
  removeOwnSkill: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirect(path);
    throw new Error("NEXT_REDIRECT");
  },
}));

const base = "../../../../app/(product)/(protected)";
const TeamRolesPage = (await import(`${base}/organization/team-roles/page`)).default;
const TeamRoleNewPage = (await import(`${base}/organization/team-roles/new/page`)).default;
const TeamRoleDetailPage = (
  await import(`${base}/organization/team-roles/[teamRoleId]/page`)
).default;
const CategoriesPage = (await import(`${base}/skills/categories/page`)).default;
const SkillNewPage = (await import(`${base}/skills/new/page`)).default;
const SkillEditPage = (await import(`${base}/skills/[skillId]/edit/page`)).default;

const ROLE = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const SKILL = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function sessionWith(...roles: string[]) {
  return { authenticated: true, user: { userId: "u-1", roles } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTeamRoles.mockResolvedValue({ ok: true, value: [] });
  getTeamRole.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
  getSkillCategories.mockResolvedValue({ ok: true, value: [] });
  getSkill.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
  getOwnSkills.mockResolvedValue({ ok: true, value: [] });
  getManagedDepartment.mockResolvedValue({ ok: false, reason: "FORBIDDEN" });
});

async function renderTeamRolePages() {
  await TeamRolesPage({ searchParams: Promise.resolve({}) });
  await TeamRoleNewPage();
  await TeamRoleDetailPage({ params: Promise.resolve({ teamRoleId: ROLE }) });
}

async function renderSkillAdminPages() {
  await CategoriesPage({ searchParams: Promise.resolve({}) });
  await SkillNewPage();
  await SkillEditPage({ params: Promise.resolve({ skillId: SKILL }) });
}

describe("team-role administration", () => {
  it("is reachable by an organization admin", async () => {
    resolveProductSession.mockResolvedValue(sessionWith("EMPLOYEE", "ORGANIZATION_ADMIN"));

    await renderTeamRolePages();

    expect(getTeamRoles).toHaveBeenCalled();
    expect(getTeamRole).toHaveBeenCalledWith(ROLE);
  });

  for (const roles of [
    ["EMPLOYEE"],
    ["EMPLOYEE", "PROJECT_MANAGER"],
    ["EMPLOYEE", "DEPARTMENT_MANAGER"],
    ["EMPLOYEE", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"],
  ]) {
    it(`makes no privileged call as ${roles.join(" + ")}`, async () => {
      // A project manager reads the catalogue while authoring a project; that is
      // a different surface and unaffected by this refusal.
      resolveProductSession.mockResolvedValue(sessionWith(...roles));

      await renderTeamRolePages();

      expect(getTeamRoles).not.toHaveBeenCalled();
      expect(getTeamRole).not.toHaveBeenCalled();
    });
  }
});

describe("skill administration", () => {
  it("is reachable by a department manager", async () => {
    resolveProductSession.mockResolvedValue(sessionWith("EMPLOYEE", "DEPARTMENT_MANAGER"));

    await renderSkillAdminPages();

    expect(getSkillCategories).toHaveBeenCalled();
    expect(getSkill).toHaveBeenCalledWith(SKILL);
  });

  for (const roles of [
    ["EMPLOYEE"],
    ["EMPLOYEE", "PROJECT_MANAGER"],
    ["EMPLOYEE", "ORGANIZATION_ADMIN"],
  ]) {
    it(`makes no privileged call as ${roles.join(" + ")}`, async () => {
      resolveProductSession.mockResolvedValue(sessionWith(...roles));

      await renderSkillAdminPages();

      expect(getSkillCategories).not.toHaveBeenCalled();
      expect(getSkill).not.toHaveBeenCalled();
    });
  }
});

describe("an expired session", () => {
  it("is sent to sign in from every new route, and reads nothing first", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    for (const page of [
      () => TeamRolesPage({ searchParams: Promise.resolve({}) }),
      () => TeamRoleNewPage(),
      () => TeamRoleDetailPage({ params: Promise.resolve({ teamRoleId: ROLE }) }),
      () => CategoriesPage({ searchParams: Promise.resolve({}) }),
      () => SkillNewPage(),
      () => SkillEditPage({ params: Promise.resolve({ skillId: SKILL }) }),
    ]) {
      vi.clearAllMocks();

      await expect(page()).rejects.toThrow("NEXT_REDIRECT");

      expect(redirect).toHaveBeenCalledWith("/login?session=expired");
      expect(getTeamRoles).not.toHaveBeenCalled();
      expect(getSkillCategories).not.toHaveBeenCalled();
      expect(getSkill).not.toHaveBeenCalled();
    }
  });
});
