import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { SkillDetail, SkillsNav } from "@/modules/skills";
import { skillAdminCapabilities } from "@/modules/skills/model/skillAdmin";
import {
  loadManagedDepartment,
  loadSkillDetail,
} from "@/modules/skills/server/loadSkills";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly skillId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { skillId } = await params;
  const state = await loadSkillDetail(skillId);

  if (state.kind !== "ready") {
    return (
      <>
        <PageHeader title="Skill" />
        <SkillsNav active="catalogue" />
        <EmptyState
          // A skill in another organization and one that never existed give the
          // same answer; an inactive skill is not hidden, because inactive is a
          // visible catalogue state rather than a secret.
          title={
            state.kind === "unavailable"
              ? "This skill does not exist or is not visible to you."
              : "Could not load this skill."
          }
          action={<Link href="/skills">Back to the catalogue</Link>}
        />
      </>
    );
  }

  // The appointment is a separate fact from the role, and only a manager needs it
  // looked up — everybody else skips the request entirely.
  const managedDepartment = await loadManagedDepartment(session.user.roles);
  const capabilities = session.user.roles.includes("DEPARTMENT_MANAGER")
    ? skillAdminCapabilities({
        skill: state.skill,
        currentUserId: session.user.userId,
        roles: session.user.roles,
        managedDepartment,
      })
    : null;

  return (
    <>
      <PageHeader
        title={state.skill.name}
        actions={<Link href="/skills">Back to the catalogue</Link>}
      />
      <SkillsNav active="catalogue" />
      <SkillDetail
        skill={state.skill}
        assignment={state.assignment}
        profileLoaded={state.profileLoaded}
        capabilities={capabilities}
      />
    </>
  );
}
