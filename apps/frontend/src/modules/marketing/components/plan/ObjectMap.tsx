import styles from "../HeroFlowDiagram.module.css";
import pages from "../../styles/pages.module.css";

/**
 * The five objects, and how they reach each other.
 *
 * The list beneath this one names each object and says what it holds. What a
 * list cannot say is which object refers to which — that people hang off a
 * department, that a requirement hangs off a project, and that a proposal is
 * the only thing joining the two halves. That is what this draws.
 *
 * The same stroke language as every other drawing on the site: dashed is a
 * proposal, solid is an allocation. This page is where a reader first meets
 * those two objects, so it is where the convention has to be visible.
 *
 * Decorative. Every object and every relationship here is written in the list
 * this sits above, so it is `aria-hidden` rather than announced a second time.
 */
export function ObjectMap() {
  return (
    <figure className={pages.objectMap}>
      <svg className={pages.objectMapDrawing} viewBox="0 0 700 336" aria-hidden="true">
        {/* who — a person hangs off a department and carries their own skills */}
        <text className={styles.stage} x="16" y="12">
          WHO
        </text>
        <Node x={16} y={20} label="Department" detail="answers for capacity" />
        <line className={styles.structure} x1="106" y1="64" x2="106" y2="104" />
        <text className={styles.labelMono} x="114" y="88">
          holds
        </text>

        <Node x={16} y={104} label="Person" detail="belongs to one department" />
        <line className={styles.structure} x1="106" y1="148" x2="106" y2="188" />
        <text className={styles.labelMono} x="114" y="172">
          declares
        </text>

        <Node x={16} y={188} label="Skill" detail="from the shared catalogue" sunken />

        {/* what — a requirement hangs off a project */}
        <text className={styles.stage} x="504" y="12">
          WHAT
        </text>
        <Node x={504} y={20} label="Project" detail="technology stack" />
        <line className={styles.structure} x1="594" y1="64" x2="594" y2="104" />
        <text className={styles.labelMono} x="586" y="88" textAnchor="end">
          carries
        </text>

        <Node x={504} y={104} label="Requirement" detail="role, and hours open" />

        {/*
          The join. A proposal is the only object that touches both halves, and
          it is dashed because it is a request rather than a fact.
        */}
        <path className={styles.proposed} d="M196 126 H228 V210 H260" />
        <path className={styles.proposed} d="M504 126 H472 V210 H440" />

        <text className={styles.stage} x="260" y="196">
          THE JOIN
        </text>
        <Node x={260} y={204} label="Proposal" detail="names a person and hours" />

        <path className={styles.accepted} d="M350 248 V282" />
        <text className={styles.labelMono} x="358" y="268">
          department accepts
        </text>

        <Node x={260} y={282} label="Allocation" detail="puts somebody on a team" accepted />
      </svg>

      <figcaption className={pages.objectMapCaption}>
        A proposal is the only object that touches both halves
      </figcaption>
    </figure>
  );
}

function Node({
  x,
  y,
  label,
  detail,
  width = 180,
  sunken,
  accepted,
}: {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly detail: string;
  readonly width?: number;
  readonly sunken?: boolean;
  readonly accepted?: boolean;
}) {
  return (
    <g>
      <rect
        className={sunken ? styles.nodeSunken : styles.node}
        x={x}
        y={y}
        width={width}
        height={44}
        rx="3"
      />
      {accepted ? <rect className={styles.rowMark} x={x + 1} y={y + 8} width="3" height="28" /> : null}
      <text className={styles.label} x={x + 14} y={y + 20}>
        {label}
      </text>
      <text className={styles.labelMono} x={x + 14} y={y + 35}>
        {detail}
      </text>
    </g>
  );
}
