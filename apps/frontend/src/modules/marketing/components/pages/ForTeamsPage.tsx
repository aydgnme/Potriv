import { FOR_TEAMS_INTRO, ROLES } from "../../landingContent";
import { MarketingPage } from "../MarketingPage";
import { RoleGlyph } from "../RoleGlyph";
import styles from "../../styles/landing.module.css";

/** `/for-teams` — the canonical home of the four role responsibilities. */
export function ForTeamsPage() {
  return (
    <MarketingPage
      href="/for-teams"
      title="Four responsibilities, one workspace"
      titleId="for-teams-title"
      lead={FOR_TEAMS_INTRO}
    >
      <section className={styles.section} aria-label="Role responsibilities">
        <div className={styles.container}>
          <ul className={styles.roles}>
            {ROLES.map((role) => (
              <li className={styles.role} key={role.title}>
                <h2 className={styles.roleHeading}>
                  <RoleGlyph className={styles.roleIcon} context={role.glyph} />
                  {role.title}
                </h2>
                <div>
                  <p className={styles.roleOwns}>{role.owns}</p>
                  <p className={styles.roleBody}>{role.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPage>
  );
}
