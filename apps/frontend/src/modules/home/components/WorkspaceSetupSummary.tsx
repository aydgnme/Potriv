import Link from "next/link";

import type { WorkspaceSetup } from "../model/workspaceSetup";

import { HomeSection } from "./HomeSection";
import styles from "./Home.module.css";

/**
 * What the founder still has to do, derived only from real reads.
 *
 * Three deliberate absences: no percentage, no "3 of 5", and no checkmark on
 * anything the product cannot actually confirm. The backend has no concept of
 * workspace completeness, so a number here would be a fact nobody measured.
 *
 * Two states look similar and mean opposite things, so the copy separates them
 * rather than leaving a marker to imply either:
 *
 * - **unknown** — "Completion is not tracked for this step." Permanent: no
 *   organization-wide project read exists, so an administrator who manages
 *   nothing would be told "no projects" about a workspace full of them.
 * - **unavailable** — "Status could not be checked right now." Temporary: the
 *   question is answerable and the read simply did not answer. Saying "not
 *   tracked" here would describe a permanent hole in the product to explain a
 *   momentary one in the network.
 *
 * Neither is styled as an error. A department check that timed out is not a
 * problem the founder caused or can fix, and the action stays available because
 * it is still the right thing to do.
 */
export function WorkspaceSetupSummary({ setup }: { readonly setup: WorkspaceSetup }) {
  return (
    <HomeSection
      title="Set up your workspace"
      summary={
        setup.settled
          ? "The basics are in place. These stay here for when you need them."
          : "A workspace needs a few things before it can staff a project."
      }
    >
      <ol className={styles.setupSteps}>
        {setup.steps.map((step, index) => {
          const done = step.state === "done";
          /**
           * Neither of these may look like an outstanding step. A plain ordinal
           * reads as "not done yet", which is a claim, and neither state is
           * entitled to make it.
           */
          const unknown = step.state === "unknown";
          const unavailable = step.state === "unavailable";
          return (
            <li className={styles.setupStep} key={step.id}>
              <span
                className={[
                  styles.setupMarker,
                  done ? styles.setupMarkerDone : null,
                  unknown ? styles.setupMarkerUnknown : null,
                  unavailable ? styles.setupMarkerUnavailable : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {done ? "✓" : unknown ? "·" : unavailable ? "?" : String(index + 1).padStart(2, "0")}
              </span>

              <div className={styles.setupBody}>
                <p
                  className={[styles.setupTitle, done ? styles.setupTitleDone : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* The state is written out, not left to the marker's shape or
                      colour — a tick is decoration, this is the fact. */}
                  {step.title}
                  {done ? <span className="p-visually-hidden"> — done</span> : null}
                  {unknown ? (
                    <span className="p-visually-hidden"> — not tracked</span>
                  ) : null}
                  {unavailable ? (
                    <span className="p-visually-hidden"> — status unavailable</span>
                  ) : null}
                </p>
                <p className={styles.setupRationale}>
                  {step.rationale}
                  {unknown ? (
                    /* Said out loud rather than left to a symbol: this step's
                       completion genuinely is not something the product can
                       see, and pretending otherwise either way would be worse
                       than admitting it. */
                    <> Completion is not tracked for this step.</>
                  ) : null}
                  {unavailable ? (
                    /* Deliberately different words: the product does track this
                       one, and saying "not tracked" would blame a permanent gap
                       for a temporary failure. */
                    <> Status could not be checked right now.</>
                  ) : null}
                </p>
              </div>

              <Link className={styles.setupAction} href={step.actionHref}>
                {step.actionLabel}
                <span className="p-visually-hidden"> — {step.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </HomeSection>
  );
}
