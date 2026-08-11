import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may reach the Organization area at all.
 *
 * The navigation only reveals it to an organization admin, but the sidebar runs
 * in the browser and the routes are reachable by typing them. What matters is
 * that a session without the role causes **no privileged call** — not that it
 * makes one and discards the answer.
 */

const resolveProductSession = vi.fn();
const getDepartments = vi.fn();
const getDepartment = vi.fn();
const getOrganizationMembers = vi.fn();
const getOrganizationInvite = vi.fn();
const redirect = vi.fn();

vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("@/modules/organization/server/organizationDataSources", () => ({
  getDepartments,
  getDepartment,
  getOrganizationMembers,
  getOrganizationInvite,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirect(path);
    throw new Error("NEXT_REDIRECT");
  },
}));

const OrganizationPage = (await import("../../../../app/(product)/(protected)/organization/page"))
  .default;
const DepartmentsPage = (
  await import("../../../../app/(product)/(protected)/organization/departments/page")
).default;
const DepartmentPage = (
  await import("../../../../app/(product)/(protected)/organization/departments/[departmentId]/page")
).default;
const InvitePage = (
  await import("../../../../app/(product)/(protected)/organization/invite/page")
).default;

const DEPARTMENT = "3e38e3cc-140c-4b89-a51d-a184c6e85700";

function sessionWith(...roles: string[]) {
  return { authenticated: true, user: { userId: "u-1", roles } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getDepartments.mockResolvedValue({ ok: true, value: [] });
  getDepartment.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
  getOrganizationMembers.mockResolvedValue({ ok: true, value: [] });
  getOrganizationInvite.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
});

async function renderAll() {
  await OrganizationPage();
  await DepartmentsPage();
  await DepartmentPage({ params: Promise.resolve({ departmentId: DEPARTMENT }) });
  await InvitePage();
}

describe("an organization admin", () => {
  beforeEach(() => {
    resolveProductSession.mockResolvedValue(sessionWith("EMPLOYEE", "ORGANIZATION_ADMIN"));
  });

  it("reaches every Organization route", async () => {
    await renderAll();

    expect(getDepartments).toHaveBeenCalled();
    expect(getOrganizationInvite).toHaveBeenCalled();
    expect(getDepartment).toHaveBeenCalledWith(DEPARTMENT);
  });
});

describe("everybody else", () => {
  for (const roles of [
    ["EMPLOYEE"],
    ["EMPLOYEE", "DEPARTMENT_MANAGER"],
    ["EMPLOYEE", "PROJECT_MANAGER"],
    ["EMPLOYEE", "DEPARTMENT_MANAGER", "PROJECT_MANAGER"],
  ]) {
    it(`makes no privileged call as ${roles.join(" + ")}`, async () => {
      resolveProductSession.mockResolvedValue(sessionWith(...roles));

      await renderAll();

      expect(getDepartments).not.toHaveBeenCalled();
      expect(getDepartment).not.toHaveBeenCalled();
      expect(getOrganizationMembers).not.toHaveBeenCalled();
      expect(getOrganizationInvite).not.toHaveBeenCalled();
    });
  }

  it("is told plainly, rather than being redirected somewhere confusing", async () => {
    resolveProductSession.mockResolvedValue(sessionWith("EMPLOYEE"));

    await OrganizationPage();

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("an expired session", () => {
  it("is sent to sign in, and asks nothing first", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    await expect(OrganizationPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login?session=expired");
    expect(getDepartments).not.toHaveBeenCalled();
    expect(getOrganizationInvite).not.toHaveBeenCalled();
  });
});
