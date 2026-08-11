import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { SkillDetail, SkillsNav } from "@/modules/skills";
import { loadSkillDetail } from "@/modules/skills/server/loadSkills";
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
      />
    </>
  );
}
