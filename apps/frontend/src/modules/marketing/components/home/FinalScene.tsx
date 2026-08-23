import Link from "next/link";

import { CREATE_WORKSPACE_HREF, FINAL_CTA, SIGN_IN_HREF } from "../../landingContent";
import { DECISION } from "../../homeModel";
import home from "../../styles/home.module.css";

/**
 * The closing scene: the page's own diagram, reduced to what it takes to start.
 *
 * The hero draws a decision with five stages, three candidates and a review
 * gate. This draws the same shape with three nodes — a department, a project,
 * one accepted allocation — because the argument the page has been making is
 * that the whole thing begins with one of each. Ending on a smaller version of
 * the opening drawing is what closes it.
 */
export function FinalScene() {
  return (
    <section className={home.final} aria-labelledby="home-start">
      <div className={home.finalInner}>
        <div className={home.finalCopy}>
          <h2 className={home.finalTitle} id="home-start">
            {FINAL_CTA.title}
          </h2>
          <p className={home.finalBody}>{FINAL_CTA.body}</p>

          <div className={home.finalActions}>
            <Link className={home.finalPrimary} href={CREATE_WORKSPACE_HREF}>
              Create your workspace
            </Link>
            <Link className={home.finalSecondary} href={SIGN_IN_HREF}>
              Sign in
            </Link>
          </div>
        </div>

        <figure className={home.finalFigure}>
          {/*
            Decorative, like every other drawing on this page. The caption under
            it is visible and names the three nodes, so exposing the drawing as
            an image would announce the same sentence twice.
          */}
          <svg className={home.finalDrawing} viewBox="0 0 300 210" aria-hidden="true">
            <rect className={home.finalNode} x="12" y="14" width="276" height="46" rx="3" />
            <text className={home.finalStage} x="26" y="34">
              DEPARTMENT
            </text>
            <text className={home.finalNodeLabel} x="26" y="52">
              {DECISION.department}
            </text>

            <path className={home.finalLine} d="M40 60 V90" />

            <rect className={home.finalNode} x="12" y="90" width="276" height="46" rx="3" />
            <text className={home.finalStage} x="26" y="110">
              PROJECT
            </text>
            <text className={home.finalNodeLabel} x="26" y="128">
              {DECISION.project}
            </text>

            <path className={home.finalLineAccepted} d="M40 136 V166" />

            <rect
              className={home.finalNodeAccepted}
              x="12"
              y="166"
              width="276"
              height="34"
              rx="3"
            />
            <circle className={home.finalMark} cx="34" cy="183" r="5" />
            <text className={home.finalNodeLabelAccepted} x="48" y="187">
              First accepted allocation
            </text>
          </svg>

          <figcaption className={home.finalCaption}>
            A department, a project, and the first allocation that follows
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
