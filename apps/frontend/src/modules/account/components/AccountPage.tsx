import Link from "next/link";

import { Alert } from "@/shared/ui/Alert";
import { PageHeader } from "@/shared/ui/PageHeader";
import { RoleChip } from "@/shared/ui/RoleChip";
import type { ProductUser } from "@/modules/auth/model/session";

import { groupSessions } from "../model/sessionList";
import type { AccountData } from "../server/loadAccount";

import { SessionTable } from "./SessionTable";
import { SignOutEverywhere } from "./SignOutEverywhere";
import styles from "./Account.module.css";

export type AccountPageProps = {
  readonly user: ProductUser;
  readonly data: AccountData;
  /**
   * Set when a "sign out everywhere" attempt produced no usable answer.
   *
   * That this page rendered at all means the session is still valid — the
   * protected layout would have redirected otherwise — so the warning states a
   * fact rather than a suspicion.
   */
  readonly signOutUnconfirmed?: boolean;
};

/**
 * Who you are and where you are signed in.
 *
 * Account is identity and security only. Project history lives in Projects,
 * because that is allocation evidence rather than account state — moving it here
 * would split one domain across two screens for no reason but proximity.
 *
 * There is no settings dashboard. Every field below is one the backend actually
 * returns; the product has no preferences, theme, notification or locale
 * contract, so it has none of those controls either.
 */
export function AccountPage({ user, data, signOutUnconfirmed = false }: AccountPageProps) {
  const grouped = data.sessions.ok ? groupSessions(data.sessions.value) : null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Account"
        description="Your identity, your sessions, and how to sign out."
      />

      {signOutUnconfirmed ? (
        /* No retry control: replaying an unsafe mutation is exactly what must
           not happen after an ambiguous one. The person can try again
           deliberately from the control below. */
        <Alert tone="warning" title="Sign out was not confirmed">
          We could not confirm whether sign out completed. You are still signed in here,
          and your other sessions may still be active.
        </Alert>
      ) : null}

      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="account-identity">
          <h2 className={styles.sectionHeading} id="account-identity">
            Identity
          </h2>
          {/*
            Exactly what `/auth/me` and the product session carry. No department,
            job title, avatar, tenure or "last login" — the contract has none of
            them, and an account screen is a poor place to start inventing.
          */}
          <dl className={styles.figures}>
            <div className={styles.figureRow}>
              <dt>Name</dt>
              <dd>{user.displayName}</dd>
            </div>
            <div className={styles.figureRow}>
              <dt>Email</dt>
              <dd className={styles.wrapAnywhere}>{user.email}</dd>
            </div>
            <div className={styles.figureRow}>
              <dt>Access roles</dt>
              <dd>
                <ul className={styles.chipList}>
                  {user.roles.map((role) => (
                    <li key={role}>
                      <RoleChip role={role} />
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="account-sessions">
          <h2 className={styles.sectionHeading} id="account-sessions">
            Sessions
          </h2>
          <p className={styles.sectionNote}>
            Every session signed in to this account. Newest first.
          </p>

          {!data.sessions.ok ? (
            /* A failed read is not "no sessions". Identity above is unaffected,
               because it never depended on this call. */
            <Alert tone="warning">
              Your sessions could not be loaded. Refresh the page to try again.
            </Alert>
          ) : grouped && grouped.current.length + grouped.others.length === 0 ? (
            /* Unexpected rather than impossible: the session reading this page
               should be in the list. Saying so beats inventing a row from
               cookies, which would be the browser guessing at security state. */
            <Alert tone="warning">
              No sessions were returned, including this one. Refresh the page to try again.
            </Alert>
          ) : grouped ? (
            <>
              {grouped.current.length > 0 ? (
                <SessionTable
                  caption="The session you are using now"
                  sessions={grouped.current}
                  headingId="sessions-current"
                  heading="This session"
                />
              ) : null}

              <SessionTable
                caption="Other sessions signed in to this account"
                sessions={grouped.others}
                headingId="sessions-other"
                heading="Other sessions"
                emptyNote="No other sessions."
              />
            </>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="account-password">
          <h2 className={styles.sectionHeading} id="account-password">
            Password
          </h2>
          {/*
            There is no authenticated change-password endpoint, so there is no
            form here. Offering one would be a control that cannot save. The real
            recovery flow is the honest route, and it is linked rather than
            described.
          */}
          <p className={styles.sectionNote}>
            Passwords are changed through the reset flow, which sends a link to your email
            address.
          </p>
          <p>
            <Link href="/forgot-password">Reset password</Link>
          </p>
        </section>

        <section className={styles.section} aria-labelledby="account-controls">
          <h2 className={styles.sectionHeading} id="account-controls">
            Session controls
          </h2>
          <SignOutEverywhere />
        </section>
      </div>
    </div>
  );
}
