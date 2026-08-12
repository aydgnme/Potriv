import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { MySkills, SkillsNav } from "@/modules/skills";
import { loadOwnSkills } from "@/modules/skills/server/loadSkills";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";

export const metadata: Metadata = { title: "My skills · Potriv" };

export const dynamic = "force-dynamic";

/**
 * The reader's own skill profile.
 *
 * `/me/skills` is self-scoped and has no user in the path — there is no way to
 * reach anybody else's profile from here, and no endpoint that would allow it.
 */
export default async function Page() {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const own = await loadOwnSkills();

  return (
    <>
      <Breadcrumbs trail={[{ label: "Skills", href: "/skills" }]} current={"My skills"} />
      <PageHeader
        title="My skills"
        description="What you can do, in your organization's own vocabulary."
      />
      <SkillsNav active="mine" />

      {own.ok ? (
        <MySkills assignments={own.value} />
      ) : (
        // Deliberately not the empty state: "your profile is empty" would be a
        // claim about somebody's own data that this failed read cannot support.
        <EmptyState title="Could not load your skills." description="Try again shortly." />
      )}
    </>
  );
}
