import type { MySkill } from "../model/homeData";
import type { Loaded } from "../server/homeDataSources";

import { HomeSection } from "./HomeSection";
import { SectionError } from "./SectionError";
import styles from "./Home.module.css";

export type MySkillsSummaryProps = {
  readonly data: Loaded<readonly MySkill[]>;
  readonly limit: number;
};

/**
 * A glance at the signed-in user's own skill profile, not the Skills screen.
 *
 * Levels and experience are printed with the labels the backend supplies —
 * "Knows", "1-2 years" — and never turned into a bar or a score. Team Finder's
 * ranking does not weight them, so a visual scale here would imply an influence
 * they do not have.
 */
export function MySkillsSummary({ data, limit }: MySkillsSummaryProps) {
  if (!data.ok) {
    return (
      <HomeSection title="My skills">
        <SectionError>Could not load your skills.</SectionError>
      </HomeSection>
    );
  }

  const skills = data.value.slice(0, limit);

  return (
    <HomeSection
      title="My skills"
      summary={data.value.length === 0 ? undefined : summaryFor(data.value.length)}
      action={{ label: "Manage skills", href: "/skills" }}
    >
      {skills.length === 0 ? (
        <p className={styles.empty}>
          No skills added yet. Adding them gives project managers better evidence
          when they review candidates.
        </p>
      ) : (
        <ul className={styles.rows}>
          {skills.map((skill) => (
            <li key={skill.employeeSkillId} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{skill.skill.name}</span>
              </div>
              <div className={styles.rowAside}>
                <span className={styles.rowMeta}>
                  {skill.level.label} · {skill.experience.label}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function summaryFor(count: number): string {
  return count === 1 ? "1 skill on your profile" : `${count} skills on your profile`;
}
