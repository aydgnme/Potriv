import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { SkillEditor, SkillsNav } from "@/modules/skills";
import { loadSkillEditor } from "@/modules/skills/server/loadSkills";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Editing a catalogue skill.
 *
 * Authorship decides this, not the role: another department manager can read the
 * skill and gets the same answer as a stranger here. The check is repeated inside
 * the action against a fresh read, so this page hiding the form is convenience
 * rather than the protection.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly skillId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { skillId } = await params;

  if (!session.user.roles.includes("DEPARTMENT_MANAGER")) {
    return (
      <>
        <PageHeader title="Edit skill" />
        <SkillsNav active="catalogue" />
        <EmptyState
          title="You do not have access to this."
          description="The skill catalogue is managed by department managers."
        />
      </>
    );
  }

  const state = await loadSkillEditor(skillId);

  if (state.kind !== "ready") {
    return (
      <>
        <PageHeader title="Edit skill" />
        <SkillsNav active="catalogue" />
        <EmptyState
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

  if (state.skill.author.userId !== session.user.userId) {
    return (
      <>
        <PageHeader title={state.skill.name} />
        <SkillsNav active="catalogue" />
        <EmptyState
          title={`${state.skill.author.name} added this skill. Only they can change it.`}
          action={<Link href={`/skills/${state.skill.skillId}`}>Back to the skill</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Edit ${state.skill.name}`}
        actions={<Link href={`/skills/${state.skill.skillId}`}>Back to the skill</Link>}
      />
      <SkillsNav active="catalogue" />
      <SkillEditor categories={state.categories} skill={state.skill} />
    </>
  );
}
