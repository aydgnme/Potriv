import { redirect } from "next/navigation";

import { resolveProductSession } from "@/modules/auth/server/productSession";
import { PersonDetail } from "@/modules/people";
import { roleEditorState } from "@/modules/people/model/roleEditor";
import {
  getOrganizationUser,
  getOrganizationUsers,
} from "@/modules/people/server/peopleDataSources";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * One person, for an organization admin.
 *
 * `GET /users/{id}` is admin-only, so the role is checked before it is called —
 * a department manager does not gain this route by having somebody in their
 * department. The organization list is read alongside because the editor's rules
 * depend on facts about the whole organization: whether this is a solo founder,
 * and whether this is the last admin.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly userId: string }>;
}) {
  const session = await resolveProductSession();
  if (!session.authenticated) redirect("/login?session=expired");

  const { userId } = await params;

  if (!session.user.roles.includes("ORGANIZATION_ADMIN")) {
    return (
      <>
        <PageHeader title="Person" />
        <EmptyState
          title="You do not have access to this."
          description="Only an Organization Admin can open a person's account and access roles."
        />
      </>
    );
  }

  const [person, organization] = await Promise.all([
    getOrganizationUser(userId),
    getOrganizationUsers(),
  ]);

  const editor =
    person.ok && organization.ok
      ? roleEditorState({
          target: person.value,
          currentUserId: session.user.userId,
          organizationUsers: organization.value,
        })
      : null;

  return <PersonDetail userId={userId} person={person} editor={editor} />;
}
