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
 * A step whose signal is unavailable is shown as an action with no completion
 * marker at all — neither ticked nor pointedly untucked. Creating the first
 * project is the standing example: no organization-wide project read exists, so
 * an administrator who is not also a project manager would be told "no
 * projects" about a workspace full of them.
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
           * An unanswerable step must not look like an outstanding one. A plain
           * ordinal reads as "not done yet", which is a claim; this step has no
           * signal behind it either way, so it gets a mark that asserts nothing.
           */
          const unknown = step.state === "unknown";
          return (
            <li className={styles.setupStep} key={step.id}>
              <span
                className={[
                  styles.setupMarker,
                  done ? styles.setupMarkerDone : null,
                  unknown ? styles.setupMarkerUnknown : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {done ? "✓" : unknown ? "·" : String(index + 1).padStart(2, "0")}
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
