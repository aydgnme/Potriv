import { FOR_TEAMS_INTRO, ROLES } from "../../landingContent";
import { RoleGlyph } from "../RoleGlyph";
import styles from "../../styles/landing.module.css";
import { MarketingShell } from "../MarketingShell";

/** `/for-teams` — the canonical home of the four role responsibilities. */
export function ForTeamsPage() {
  return (
    <MarketingShell>
      <section className={styles.section} aria-labelledby="for-teams-title">
        <div className={styles.container}>
          <p className={styles.eyebrow}>For teams</p>
          <h1 className={styles.pageTitle} id="for-teams-title">
            Four responsibilities, one workspace
          </h1>
          <p className={styles.sectionIntro}>{FOR_TEAMS_INTRO}</p>

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
    </MarketingShell>
  );
}
