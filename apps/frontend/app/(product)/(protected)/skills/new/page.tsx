import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { SkillEditor, SkillsNav } from "@/modules/skills";
import { loadSkillCreationCategories } from "@/modules/skills/server/loadSkills";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";

export const metadata: Metadata = { title: "New skill · Potriv" };

export const dynamic = "force-dynamic";

/**
 * Adding a skill to the shared catalogue.
 *
 * Any department manager may, appointment or not. The backend records whoever
 * makes the request as the author, and only they can change it afterwards.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  if (!session.user.roles.includes("DEPARTMENT_MANAGER")) {
    return (
      <>
        <PageHeader title="New skill" />
        <SkillsNav active="catalogue" />
        <EmptyState
          title="You do not have access to this."
          description="The skill catalogue is managed by department managers."
        />
      </>
    );
  }

  const categories = await loadSkillCreationCategories();

  return (
    <>
      <Breadcrumbs trail={[{ label: "Skills", href: "/skills" }]} current={"New skill"} />
      <PageHeader
        title="New skill"
        description="Skills belong to a category, and the catalogue is shared across the organization."
      />
      <SkillsNav active="catalogue" />

      {!categories.ok ? (
        <EmptyState title="Could not load categories." description="Try again shortly." />
      ) : categories.value.length === 0 ? (
        <EmptyState
          title="There are no active categories yet."
          description="Every skill belongs to one."
          action={<Link href="/skills/categories">Manage categories</Link>}
        />
      ) : (
        <SkillEditor categories={categories.value} />
      )}
    </>
  );
}
