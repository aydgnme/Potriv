import { HERO } from "../../landingContent";
import { DECISION, STATES } from "../../homeModel";
import home from "../../styles/home.module.css";

/**
 * The one distinction the product turns on, on the page's darkest ground.
 *
 * Not two cards side by side. It is a single request drawn twice — the same
 * person, the same hours, the same project — once before the owning department
 * has answered and once after. Two cards would invite a reader to treat them as
 * alternatives to choose between; one request in two states is what they are.
 *
 * The states are separated three ways and never by colour alone: dashed against
 * solid, a hollow mark against a filled one, and the words "Proposal" and
 * "Accepted allocation" written on each.
 *
 * Its own stroke classes rather than the shared diagram language, because that
 * language is measured against a white ground — `--p-brand-line` at 3.32:1 on
 * white is far too dark here. These use the inverse family instead.
 */
export function ProposalGate() {
  return (
    <figure className={home.gate}>
      {/* Decorative: the written pair below carries every claim the drawing makes. */}
      <svg className={home.gateDrawing} viewBox="0 0 720 200" aria-hidden="true">
        {/* Before: the request, put forward and not yet answered. */}
        <text className={home.gateStage} x="16" y="40">
          BEFORE REVIEW
        </text>
        <rect className={home.gateNode} x="16" y="52" width="212" height="76" rx="3" />
        <circle className={home.gateMarkHollow} cx="38" cy="80" r="6" />
        <text className={home.gateLabel} x="54" y="84">
          {DECISION.candidates[0].name}
        </text>
        <text className={home.gateMono} x="30" y="108">
          {STATES.proposed.detail}
        </text>
        <text className={home.gateStatus} x="30" y="122">
          {STATES.proposed.label}
        </text>

        {/* The proposal run: dashed, and named. */}
        <path className={home.gateProposed} d="M228 90 H316" />
        <text className={home.gateMono} x="272" y="80" textAnchor="middle">
          pending
        </text>

        {/* The gate itself. */}
        <rect className={home.gateReview} x="316" y="56" width="88" height="68" rx="3" />
        <text className={home.gateLabel} x="360" y="86" textAnchor="middle">
          Review
        </text>
        <text className={home.gateMono} x="360" y="104" textAnchor="middle">
          {DECISION.department.split(" ")[0]}
        </text>

        {/* After: the same request, answered. Solid. */}
        <path className={home.gateAccepted} d="M404 90 H492" />
        <text className={home.gateMono} x="448" y="80" textAnchor="middle">
          accepted
        </text>

        <text className={home.gateStage} x="492" y="40">
          AFTER REVIEW
        </text>
        <rect className={home.gateNodeStrong} x="492" y="52" width="212" height="76" rx="3" />
        <circle className={home.gateMarkFilled} cx="514" cy="80" r="6" />
        <text className={home.gateLabelStrong} x="530" y="84">
          {DECISION.candidates[0].name}
        </text>
        <text className={home.gateMono} x="506" y="108">
          {STATES.accepted.detail}
        </text>
        <text className={home.gateStatusStrong} x="506" y="122">
          {STATES.accepted.label}
        </text>
      </svg>

      <figcaption className={home.gateCaption}>
        One request, before and after the department answers
      </figcaption>
      <p className={home.gateDescription}>
        {`${DECISION.candidates[0].name} is put forward for ${DECISION.capacity} on ` +
          `${DECISION.project}. Until ${DECISION.department} accepts it, the ` +
          `connection is drawn as a dashed line and the mark is hollow: it is a ` +
          `proposal, and nobody is on the team. After acceptance the same ` +
          `connection is solid and the mark is filled.`}
      </p>

      {/*
        The convention the drawing uses, stated. These two sentences are the
        canonical wording of the rule and live in `HERO.truths`; the drawing
        above is one instance of what they describe, not a second version of it.
      */}
      <ul className={home.gateLegend}>
        {HERO.truths.map((truth) => (
          <li className={home.gateLegendLine} key={truth}>
            {truth}
          </li>
        ))}
      </ul>

      {/* The same two states in words, for anyone the drawing does not reach. */}
      <ul className={home.gateStates}>
        <li className={home.gateState}>
          <span className={home.gateStateLabel}>{STATES.proposed.label}</span>
          <span className={home.gateStateStatus}>{STATES.proposed.status}</span>
          <span className={home.gateStateNote}>{STATES.proposed.note}</span>
        </li>
        <li className={home.gateStateAccepted}>
          <span className={home.gateStateLabel}>{STATES.accepted.label}</span>
          <span className={home.gateStateStatus}>{STATES.accepted.status}</span>
          <span className={home.gateStateNote}>{STATES.accepted.note}</span>
        </li>
      </ul>
    </figure>
  );
}
