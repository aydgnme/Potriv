import type { CSSProperties } from "react";

import { DECISION, GRAPH_STAGES } from "../../homeModel";
import styles from "../HeroFlowDiagram.module.css";
import home from "../../styles/home.module.css";

/**
 * One staffing decision, drawn.
 *
 * The hero's anchor: a requirement, the evidence behind it, three ranked
 * candidates, the department that owns the answer, and the allocation that
 * results. It is the product's own model rather than an illustration of a
 * product — every panel is an object Potriv has, and every label is a field.
 *
 * The stroke language is shared with the flow diagram on How it works, which is
 * why this imports that stylesheet rather than restating it. `.proposed` and
 * `.accepted` carry the one distinction the whole product turns on, and there
 * has to be exactly one definition of them.
 *
 * Two compositions, not one drawing scaled: shrinking the wide graph to 340px
 * would leave 7px labels, so the narrow variant is a genuinely different
 * arrangement carrying the same five stages. Both are always in the DOM and one
 * is hidden, which keeps the whole thing server-rendered — no measurement, no
 * client boundary, no layout flash.
 *
 * The animated groups are siblings rather than nested. A row inside an animated
 * stage would have its own fade multiplied by its parent's, so the last
 * candidate would arrive dimmer than the first and never quite catch up.
 */

/**
 * The proposal's route, in one place.
 *
 * It leaves the selected candidate's row on the right, runs down the outside of
 * the column and comes back into the review gate. The detour is the point: a
 * proposal is a different kind of edge from the structural flow, so it does not
 * travel in the same channel as the lines that only say "and then".
 */
const PROPOSAL = {
  portX: 372,
  portY: 207,
  gutterX: 396,
  entryY: 336,
} as const;

const PROPOSAL_PATH =
  `M${PROPOSAL.portX} ${PROPOSAL.portY} H${PROPOSAL.gutterX} ` +
  `V${PROPOSAL.entryY} H${PROPOSAL.portX}`;

/** Order in the choreography, so a stage's delay is derived rather than written. */
const stageOrder = (index: number) => ({ "--stage": index }) as CSSProperties;
const rowOrder = (index: number) => ({ "--row": index }) as CSSProperties;

export function DecisionGraph() {
  const [first, second, third] = DECISION.candidates;

  return (
    <figure className={home.graph}>
      <WideGraph />
      <NarrowGraph />

      <figcaption className={home.graphCaption}>A worked example, not a screenshot</figcaption>

      {/*
        The drawing's text equivalent, and the reason both `svg` elements are
        `aria-hidden`. A screen reader gets the five stages as an ordered list
        rather than as one long sentence — the sequence is the claim, and a list
        is the thing that carries a sequence. The prose under it adds what the
        list cannot: which candidate was put forward and what settled it.
      */}
      <ol className={home.graphStages} aria-label="How a requirement becomes an allocation">
        {GRAPH_STAGES.map((stage) => (
          <li key={stage.number}>{stage.label}</li>
        ))}
      </ol>

      <p className={home.graphDescription}>
        {`${DECISION.project} needs a ${DECISION.requirement} for ` +
          `${DECISION.capacity}, with ${DECISION.skills.join(" and ")}. Team Finder ranks ` +
          `${first.name} at ${first.score}, ${second.name} at ${second.score} and ` +
          `${third.name} at ${third.score}. The top candidate is put forward as a ` +
          `proposal — drawn as a dashed line, because nobody is on the team yet — ` +
          `and ${DECISION.department} accepts it, which is the solid line that ` +
          `makes it an allocation.`}
      </p>
    </figure>
  );
}

/** Shared panel chrome, so every object on the graph is drawn the same way. */
function Panel({
  x,
  y,
  width,
  height,
  sunken,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sunken?: boolean;
}) {
  return (
    <rect
      className={sunken ? styles.nodeSunken : styles.node}
      x={x}
      y={y}
      width={width}
      height={height}
      rx="3"
    />
  );
}

function WideGraph() {
  const [first, second, third] = DECISION.candidates;
  const rows = [first, second, third];

  return (
    <svg
      className={home.graphWide}
      viewBox="0 0 420 462"
      aria-hidden="true"
    >
      {/* 01 — the requirement */}
      <g className={home.graphStage} style={stageOrder(0)}>
        <text className={styles.stage} x="44" y="14">
          01 REQUIREMENT
        </text>
        <Panel x={16} y={22} width={356} height={76} />
        <text className={styles.label} x="30" y="44">
          {DECISION.project}
        </text>
        <line className={styles.structure} x1="30" y1="54" x2="358" y2="54" />
        <text className={styles.labelMuted} x="30" y="72">
          {DECISION.requirement}
        </text>
        <text className={styles.labelMono} x="30" y="88">
          {DECISION.skills.join(" · ")}
        </text>
        <text className={styles.labelMono} x="358" y="88" textAnchor="end">
          {DECISION.capacity}
        </text>
        <line className={styles.structure} x1="28" y1="98" x2="28" y2="130" />
      </g>

      {/* 02 — what the ranking is made of */}
      <g className={home.graphStage} style={stageOrder(1)}>
        <text className={styles.stage} x="44" y="118">
          02 EVIDENCE
        </text>
        <Panel x={16} y={130} width={170} height={26} sunken />
        <text className={styles.labelMuted} x="28" y="147">
          Skills matched
        </text>
        <Panel x={202} y={130} width={170} height={26} sunken />
        <text className={styles.labelMuted} x="214" y="147">
          Capacity confirmed
        </text>
        <line className={styles.structure} x1="28" y1="156" x2="28" y2="190" />
      </g>

      {/* 03 — the ranking itself */}
      <g className={home.graphStage} style={stageOrder(2)}>
        <text className={styles.stage} x="44" y="178">
          03 RANKED CANDIDATES
        </text>
        <Panel x={16} y={190} width={356} height={94} />
      </g>

      {rows.map((candidate, index) => {
        const top = 192 + index * 30;
        const baseline = top + 19;
        return (
          <g className={home.graphRow} key={candidate.rank} style={rowOrder(index)}>
            {candidate.selected ? (
              <rect className={styles.rowMark} x="17" y={top + 3} width="3" height="24" />
            ) : null}
            <text className={styles.labelMono} x="30" y={baseline}>
              {candidate.rank}
            </text>
            <circle
              className={candidate.selected ? styles.personSelected : styles.person}
              cx="54"
              cy={baseline - 4}
              r="4.5"
            />
            <text
              className={candidate.selected ? styles.label : styles.labelMuted}
              x="66"
              y={baseline}
            >
              {candidate.name}
            </text>
            <text className={styles.score} x="358" y={baseline} textAnchor="end">
              {candidate.score}
            </text>
            {index < rows.length - 1 ? (
              <line
                className={styles.structure}
                x1="16"
                y1={top + 30}
                x2="372"
                y2={top + 30}
              />
            ) : null}
          </g>
        );
      })}

      {/* 04 — the gate, before the request reaches it */}
      <g className={home.graphStage} style={stageOrder(3)}>
        <text className={styles.stage} x="44" y="304">
          04 DEPARTMENT REVIEW
        </text>
        <Panel x={16} y={312} width={356} height={48} />
        <text className={styles.label} x="30" y="332">
          {DECISION.department}
        </text>
        <text className={styles.labelMuted} x="30" y="350">
          Accepts or rejects the request
        </text>
      </g>

      {/*
        The proposal. Dashed, and named in words beside it — the dash pattern is
        the second signal, never the only one.
      */}
      <g className={home.graphProposal}>
        <path className={styles.proposed} d={PROPOSAL_PATH} />
        <circle className={styles.port} cx={PROPOSAL.portX} cy={PROPOSAL.portY} r="3.5" />
        {/*
          Below the ranked panel, not level with the run it names. At the run's
          midpoint the word sat inside the panel and printed straight through
          the third candidate's score.
        */}
        <text className={styles.labelMono} x={PROPOSAL.gutterX - 6} y="302" textAnchor="end">
          proposal
        </text>
      </g>

      {/* The acceptance, drawn rather than faded: it is the thing that takes time. */}
      <path className={`${styles.accepted} ${home.graphAccepted}`} d="M28 360 V392" />

      {/* 05 — the only state that puts somebody on a team */}
      <g className={home.graphAcceptedNode}>
        <text className={styles.stage} x="44" y="382">
          05 ACCEPTED ALLOCATION
        </text>
        <Panel x={16} y={392} width={356} height={54} />
        <circle className={styles.personSelected} cx="34" cy="412" r="5" />
        <text className={styles.label} x="48" y="416">
          {first.name}
        </text>
        <text className={styles.labelMono} x="30" y="436">
          {`${DECISION.capacity} · ${DECISION.project}`}
        </text>
        <text className={styles.score} x="358" y="416" textAnchor="end">
          accepted
        </text>
      </g>
    </svg>
  );
}

/**
 * The narrow composition.
 *
 * Same five stages and the same two line states. The proposal cannot detour
 * around a 300px column without either crossing the panels or vanishing, so
 * here it runs in the same channel as the structural lines — still dashed,
 * still named.
 */
function NarrowGraph() {
  const [first, second, third] = DECISION.candidates;
  const rows = [first, second, third];

  return (
    <svg className={home.graphNarrow} viewBox="0 0 320 430" aria-hidden="true">
      <g className={home.graphStage} style={stageOrder(0)}>
        <text className={styles.stage} x="34" y="12">
          01 REQUIREMENT
        </text>
        <Panel x={10} y={20} width={300} height={62} />
        <text className={styles.label} x="24" y="40">
          {DECISION.project}
        </text>
        <text className={styles.labelMuted} x="24" y="57">
          {DECISION.requirement}
        </text>
        <text className={styles.labelMono} x="24" y="73">
          {`${DECISION.skills.join(" · ")} · ${DECISION.capacity}`}
        </text>
        <line className={styles.structure} x1="22" y1="82" x2="22" y2="110" />
      </g>

      <g className={home.graphStage} style={stageOrder(1)}>
        <text className={styles.stage} x="34" y="100">
          02 EVIDENCE
        </text>
        <Panel x={10} y={110} width={300} height={24} sunken />
        <text className={styles.labelMuted} x="24" y="126">
          Skills matched · Capacity confirmed
        </text>
        <line className={styles.structure} x1="22" y1="134" x2="22" y2="162" />
      </g>

      <g className={home.graphStage} style={stageOrder(2)}>
        <text className={styles.stage} x="34" y="152">
          03 RANKED CANDIDATES
        </text>
        <Panel x={10} y={162} width={300} height={84} />
      </g>

      {rows.map((candidate, index) => {
        const top = 164 + index * 27;
        const baseline = top + 18;
        return (
          <g className={home.graphRow} key={candidate.rank} style={rowOrder(index)}>
            {candidate.selected ? (
              <rect className={styles.rowMark} x="11" y={top + 3} width="3" height="21" />
            ) : null}
            <text className={styles.labelMono} x="24" y={baseline}>
              {candidate.rank}
            </text>
            <text
              className={candidate.selected ? styles.label : styles.labelMuted}
              x="46"
              y={baseline}
            >
              {candidate.name}
            </text>
            <text className={styles.score} x="296" y={baseline} textAnchor="end">
              {candidate.score}
            </text>
            {index < rows.length - 1 ? (
              <line
                className={styles.structure}
                x1="10"
                y1={top + 27}
                x2="310"
                y2={top + 27}
              />
            ) : null}
          </g>
        );
      })}

      <g className={home.graphStage} style={stageOrder(3)}>
        <text className={styles.stage} x="34" y="290">
          04 DEPARTMENT REVIEW
        </text>
        <Panel x={10} y={298} width={300} height={40} />
        <text className={styles.label} x="24" y="316">
          {DECISION.department}
        </text>
        <text className={styles.labelMuted} x="24" y="332">
          Accepts or rejects
        </text>
      </g>

      <g className={home.graphProposal}>
        <path className={styles.proposed} d="M22 246 V276" />
        <text className={styles.labelMono} x="34" y="266">
          proposal
        </text>
      </g>

      <path className={`${styles.accepted} ${home.graphAccepted}`} d="M22 338 V368" />

      <g className={home.graphAcceptedNode}>
        <text className={styles.stage} x="34" y="382">
          05 ACCEPTED ALLOCATION
        </text>
        <Panel x={10} y={390} width={300} height={36} />
        <circle className={styles.personSelected} cx="26" cy="408" r="4.5" />
        <text className={styles.label} x="40" y="412">
          {`${first.name} · ${DECISION.capacity}`}
        </text>
      </g>
    </svg>
  );
}
