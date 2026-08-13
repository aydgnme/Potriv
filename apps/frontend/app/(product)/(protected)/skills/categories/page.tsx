import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { CategoryAdmin, SkillsNav } from "@/modules/skills";
import {
  loadCategoryAdmin,
  readIncludeInactive,
} from "@/modules/skills/server/loadSkills";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";

export const metadata: Metadata = { title: "Skill categories · Potriv" };

export const dynamic = "force-dynamic";

/**
 * Category administration.
 *
 * Department-manager work — the role alone, with no appointment needed, because
 * categories belong to the organization rather than to any one department. The
 * shared catalogue at `/skills` stays readable by everybody either way.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("DEPARTMENT_MANAGER")) {
    return (
      <>
        <PageHeader title="Skill categories" />
        <SkillsNav active="catalogue" />
        <EmptyState
          title="You do not have access to this."
          description="Skill categories are managed by department managers."
        />
      </>
    );
  }

  const includeInactive = readIncludeInactive(await searchParams);
  const state = await loadCategoryAdmin(includeInactive);

  return (
    <>
      <Breadcrumbs trail={[{ label: "Skills", href: "/skills" }]} current={"Skill categories"} />
      <PageHeader
        title="Skill categories"
        description="Every skill belongs to a category."
      />
      <SkillsNav active="catalogue" />

      {state.kind === "ready" ? (
        <CategoryAdmin categories={state.categories} includeInactive={includeInactive} />
      ) : (
        <EmptyState title="Could not load categories." description="Try again shortly." />
      )}
    </>
  );
}
