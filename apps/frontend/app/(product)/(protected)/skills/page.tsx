import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { SkillCatalogue, SkillsNav } from "@/modules/skills";
import type { RawSearchParams } from "@/modules/skills/model/catalogueQuery";
import { loadCatalogue } from "@/modules/skills/server/loadSkills";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The shared skill catalogue.
 *
 * Every authenticated person in the organization can read this — it is the shared
 * vocabulary, not an administrative surface — so there is no role gate beyond
 * being signed in.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<RawSearchParams>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const state = await loadCatalogue(await searchParams);

  return (
    <>
      <PageHeader title="Skills" description="What people in your organization can do." />
      <SkillsNav active="catalogue" />

      {state.kind === "error" ? (
        <EmptyState title="Could not load the skill catalogue." description="Try again shortly." />
      ) : state.skills.ok ? (
        <SkillCatalogue
          query={state.query}
          categories={state.categories}
          skills={state.skills.value}
        />
      ) : (
        <EmptyState title="Could not load skills." description="Try again shortly." />
      )}
    </>
  );
}
