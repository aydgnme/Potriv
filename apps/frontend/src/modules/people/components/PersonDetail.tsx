import Link from "next/link";

import { EmptyState } from "@/shared/ui/EmptyState";
import { Breadcrumbs } from "@/shared/ui/Breadcrumbs";
import { PageHeader } from "@/shared/ui/PageHeader";
import { formatDate } from "@/shared/utils/formatDate";

import type { OrganizationUserDetail } from "../model/peopleData";
import type { RoleEditorState } from "../model/roleEditor";
import type { Loaded } from "../server/peopleDataSources";

import { AccessRoleEditor } from "./AccessRoleEditor";
import styles from "./People.module.css";

export type PersonDetailProps = {
  readonly userId: string;
  readonly person: Loaded<OrganizationUserDetail>;
  readonly editor: RoleEditorState | null;
};

/**
 * One person, and the capabilities they hold.
 *
 * Identity and roles are all `GET /users/{id}` returns. There is no department
 * here, no account status, no projects and no sessions — the endpoint has none
 * of them, and this screen is not the place to assemble them from elsewhere.
 */
export function PersonDetail({ userId, person, editor }: PersonDetailProps) {
  if (!person.ok) {
    return (
      <div className={styles.page}>
        <PageHeader title="Person" />
        {person.reason === "ERROR" ? (
          <EmptyState
            title="Could not load this person."
            description="Refresh the page to try again."
          />
        ) : (
          // A person who does not exist and one who is not visible answer the
          // same way, so being refused never confirms an account is there.
          <EmptyState
            title="This person does not exist or is not visible to you."
            action={<Link href="/people">Back to People</Link>}
          />
        )}
      </div>
    );
  }

  const detail = person.value;

  return (
    <div className={styles.page}>
      <Breadcrumbs
        trail={[{ label: "People", href: "/people" }]}
        current={detail.name}
      />
      <PageHeader
        title={detail.name}
        description={detail.email}
        actions={<Link href="/people">Back to People</Link>}
      />

      <section className={styles.panel} aria-labelledby="person-identity">
        <h2 className={styles.panelHeading} id="person-identity">
          Account
        </h2>
        <dl className={styles.figures}>
          <div className={styles.figureRow}>
            <dt>Email</dt>
            <dd>{detail.email}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Added</dt>
            <dd>{formatDate(detail.createdAt) ?? "Not recorded"}</dd>
          </div>
          <div className={styles.figureRow}>
            <dt>Last updated</dt>
            <dd>{formatDate(detail.updatedAt) ?? "Not recorded"}</dd>
          </div>
        </dl>
      </section>

      {editor ? <AccessRoleEditor userId={userId} state={editor} /> : null}
    </div>
  );
}
