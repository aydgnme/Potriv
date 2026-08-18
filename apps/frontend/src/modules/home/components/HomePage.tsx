import { PageHeader } from "@/shared/ui/PageHeader";
import type { AccessRole } from "@/shared/types/accessRole";

import { buildWorkspaceSetup } from "../model/workspaceSetup";
import type { HomeData } from "../server/loadHome";

import { DepartmentProjectsSummary } from "./DepartmentProjectsSummary";
import { ManagedProjectsSummary } from "./ManagedProjectsSummary";
import { MyCurrentWork } from "./MyCurrentWork";
import { MySkillsSummary } from "./MySkillsSummary";
import { OrganizationSetupSummary } from "./OrganizationSetupSummary";
import { PendingReviewsSummary } from "./PendingReviewsSummary";
import { WorkspaceSetupSummary } from "./WorkspaceSetupSummary";
import styles from "./Home.module.css";

export type HomePageProps = {
  readonly displayName: string;
  readonly roles: readonly AccessRole[];
  readonly data: HomeData;
  readonly previewLimit: number;
};

/**
 * One Home, composed from the union of the user's roles.
 *
 * There is no role switcher and no per-role page. Common sections appear once
 * however many roles someone holds, and a role-specific section appears only if
 * that role is held — an employee never sees an empty manager panel, because it
 * is absent rather than blank.
 *
 * Order runs from what needs a decision to what is merely yours: a department
 * manager's review queue is the only place another person is blocked, so it
 * comes before anything of one's own.
 *
 * Workspace setup sits after the operational sections for the same reason. A
 * founder with three staffing requests waiting has work that outranks
 * onboarding, and guidance that pushed those down the page would be optimising
 * for the first day at the expense of every day after it.
 */
export function HomePage({ displayName, roles, data, previewLimit }: HomePageProps) {
  const isProjectManager = roles.includes("PROJECT_MANAGER");
  const isDepartmentManager = roles.includes("DEPARTMENT_MANAGER");
  const isOrganizationAdmin = roles.includes("ORGANIZATION_ADMIN");

  return (
    <div className={styles.page}>
      <PageHeader
        title="Home"
        description={`Welcome back, ${displayName}. Here is what needs your attention.`}
      />

      <div className={styles.sections}>
        {isDepartmentManager && data.pendingProposals ? (
          <PendingReviewsSummary data={data.pendingProposals} limit={previewLimit} />
        ) : null}

        {isProjectManager && data.managedProjects ? (
          <ManagedProjectsSummary data={data.managedProjects} limit={previewLimit} />
        ) : null}

        {isDepartmentManager && data.departmentProjects ? (
          <DepartmentProjectsSummary data={data.departmentProjects} limit={previewLimit} />
        ) : null}

        {isOrganizationAdmin && data.departments && data.organizationUsers ? (
          <OrganizationSetupSummary
            departments={data.departments}
            users={data.organizationUsers}
            limit={previewLimit}
          />
        ) : null}

        {isOrganizationAdmin ? (
          <WorkspaceSetupSummary
            setup={buildWorkspaceSetup({
              departments: data.departments,
              teamRoles: data.teamRoles,
              skills: data.organizationSkills,
              organizationUsers: data.organizationUsers,
            })}
          />
        ) : null}

        <MyCurrentWork data={data.myProjects} limit={previewLimit} />
        <MySkillsSummary data={data.mySkills} limit={previewLimit} />
      </div>
    </div>
  );
}
