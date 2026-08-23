import { PersonMark } from "@/shared/ui/PersonMark";
import styles from "./HeroFlowDiagram.module.css";

/**
 * The staffing flow, drawn.
 *
 * Five stages — requirements, evidence, ranked candidates, review, active team —
 * because that is the actual sequence the product performs, not a marketing
 * abstraction of it. The names and scores are demonstration values and nothing
 * reads them; they exist so the drawing shows a real shape of data rather than
 * lorem boxes.
 *
 * The one idea this has to land: an accepted allocation is drawn solid, and a
 * proposal stays dashed until the owning department accepts it. That is Potriv's
 * central distinction, so it earns the strongest visual treatment on the page.
 *
 * Rendered as inline SVG with no script and no client boundary — it is part of
 * the server-rendered document, so it is present before hydration and survives
 * JavaScript being unavailable entirely.
 *
 * Three things were wrong with the ranked-candidates half and are fixed here:
 *
 * 1. The card ended exactly on the `viewBox` edge, so its right stroke and
 *    rounded corner were clipped off. It now stops well short — see `RANKED`.
 * 2. The proposal connector left from the selected person's own x-coordinate and
 *    ran straight down through the two people below them, crossing glyphs and
 *    row dividers on the way. It now leaves from a port on the card's edge and
 *    is outside the card before it turns.
 * 3. A native `<title>` gave the whole drawing a hover tooltip that covered the
 *    thing it was describing. The accessible name and description now come from
 *    a visually hidden caption instead, which no browser turns into a tooltip.
 */

/** Demonstration content. Deliberately inert: no product behaviour reads this. */
const CANDIDATES = [
  { name: "Mert Aydogan", score: "80", selected: true },
  { name: "Ana Popescu", score: "72", selected: false },
  { name: "Ioana Marin", score: "68", selected: false },
] as const;

const CAPTION_ID = "hero-flow-caption";
const DESC_ID = "hero-flow-desc";

const TITLE = "How Potriv staffs a project";
const DESC =
  "Project requirements produce evidence, evidence ranks candidates, a proposal " +
  "goes to the owning department for review, and only an accepted proposal " +
  "becomes part of the active team. Three candidates are ranked by score; the " +
  "highest, Mert Aydogan at 80, is marked with a bar beside the row and is the " +
  "one proposed. Proposals are drawn as dashed lines and accepted allocations " +
  "as solid lines.";

/**
 * The desktop ranked-candidates geometry, in one place.
 *
 * These were literals scattered through the markup, which is how the card came
 * to end on the `viewBox` edge and how the connector came to share the person
 * column's x. Naming them makes both mistakes visible and both contracts
 * testable.
 */
const RANKED = {
  x: 440,
  y: 22,
  width: 258,
  height: 118,
  /** Right edge at 698, leaving 22 units of clear space before the 720 edge. */
  get right() {
    return this.x + this.width;
  },
  firstRowY: 44,
  rowHeight: 32,
  markX: 444,
  personX: 462,
  nameX: 478,
  scoreEndX: 682,
  dividerFromX: 456,
  dividerToX: 682,
  /** The dashed run leaves the card here and turns only once it is clear of it. */
  portGutterX: 710,
  reviewEntryY: 210,
  reviewEntryX: 306,
} as const;

export function HeroFlowDiagram() {
  return (
    <figure className={styles.figure}>
      {/*
        Both variants are in the DOM and CSS hides one. A `display: none` subtree
        is outside the accessibility tree, so exactly one labelled image is
        exposed at any width — the reader never meets the same figure twice, and
        both can safely point at the one caption below.
      */}
      <DesktopFlow />
      <MobileFlow />

      {/*
        Not an SVG `<title>`. That element is what browsers render as a hover
        tooltip, and on a diagram this dense the tooltip lands on top of the
        drawing it is meant to explain. A visually hidden caption carries the
        same name to the accessibility tree and produces no tooltip at all.
      */}
      <figcaption className="p-visually-hidden" id={CAPTION_ID}>
        {TITLE}
      </figcaption>
      <p className="p-visually-hidden" id={DESC_ID}>
        {DESC}
      </p>
    </figure>
  );
}

function DesktopFlow() {
  return (
    <svg
      className={styles.desktop}
      viewBox="0 0 720 400"
      role="img"
      aria-labelledby={CAPTION_ID}
      aria-describedby={DESC_ID}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ---------- 1. Requirements ---------- */}
      <text className={styles.stage} x="0" y="12">
        REQUIREMENTS
      </text>
      <rect className={styles.node} x="0" y="22" width="186" height="118" rx="4" />
      <text className={styles.label} x="14" y="44">
        Project Orion
      </text>
      <line className={styles.structure} x1="14" y1="54" x2="172" y2="54" />
      <text className={styles.labelMono} x="14" y="72">
        Java · PostgreSQL · React
      </text>
      <text className={styles.labelMuted} x="14" y="92">
        Backend Engineer ×2
      </text>
      <text className={styles.labelMuted} x="14" y="110">
        Frontend Engineer ×1
      </text>
      <text className={styles.labelMuted} x="14" y="128">
        QA Engineer ×1
      </text>

      {/* requirements → evidence */}
      <path className={styles.structure} d="M186 81 H236" />
      <path className={styles.structure} d="M231 76 l6 5 -6 5" />

      {/* ---------- 2. Evidence (glass) ---------- */}
      <text className={styles.stage} x="238" y="12">
        EVIDENCE
      </text>
      <rect className={styles.glassPanel} x="238" y="22" width="150" height="118" rx="4" />
      <text className={styles.labelMuted} x="250" y="46">
        skill matches
      </text>
      <line className={styles.structure} x1="250" y1="56" x2="376" y2="56" />
      <text className={styles.labelMuted} x="250" y="76">
        past projects
      </text>
      <line className={styles.structure} x1="250" y1="86" x2="376" y2="86" />
      <text className={styles.labelMuted} x="250" y="106">
        capacity
      </text>
      <text className={styles.labelMono} x="250" y="128">
        deterministic
      </text>

      {/* evidence → candidates */}
      <path className={styles.structure} d="M388 81 H438" />
      <path className={styles.structure} d="M433 76 l6 5 -6 5" />

      {/* ---------- 3. Ranked candidates ---------- */}
      <text className={styles.stage} x={RANKED.x} y="12">
        RANKED CANDIDATES
      </text>
      <rect
        className={styles.node}
        x={RANKED.x}
        y={RANKED.y}
        width={RANKED.width}
        height={RANKED.height}
        rx="4"
      />
      {CANDIDATES.map((candidate, index) => {
        const y = RANKED.firstRowY + index * RANKED.rowHeight;
        return (
          <g key={candidate.name}>
            {/*
              Selection carried by a shape, not a hue: a bar on the row's leading
              edge, plus the name in the stronger text weight. Somebody who cannot
              separate the teal from the charcoal still sees which row is the one.
            */}
            {candidate.selected ? (
              <rect
                className={styles.rowMark}
                x={RANKED.markX}
                y={y - 11}
                width="3"
                height="22"
                rx="1.5"
              />
            ) : null}
            <PersonMark
              x={RANKED.personX}
              y={y - 4}
              scale={1.15}
              className={candidate.selected ? styles.personSelected : styles.person}
            />
            <text
              className={candidate.selected ? styles.label : styles.labelMuted}
              x={RANKED.nameX}
              y={y}
            >
              {candidate.name}
            </text>
            <text className={styles.score} x={RANKED.scoreEndX} y={y} textAnchor="end">
              {candidate.score}
            </text>
            {index < CANDIDATES.length - 1 ? (
              <line
                className={styles.structure}
                x1={RANKED.dividerFromX}
                y1={y + 12}
                x2={RANKED.dividerToX}
                y2={y + 12}
              />
            ) : null}
          </g>
        );
      })}

      {/*
        The proposal, dashed because it has not been accepted yet.

        It leaves the selected row through a port on the card's right edge and is
        outside the card before it turns down, so it crosses no glyph, no name,
        no score and no row divider. The old path started at the selected
        person's own x and ran straight down through the two people below them.
      */}
      <path
        className={styles.proposed}
        d={
          `M${RANKED.right} ${RANKED.firstRowY} ` +
          `H${RANKED.portGutterX} ` +
          `V${RANKED.reviewEntryY} ` +
          `H${RANKED.reviewEntryX}`
        }
      />
      <path className={styles.proposed} d="M306 205 l-6 5 6 5" />
      {/* The port itself, drawn last so it reads as attached to the row. */}
      <circle
        className={styles.port}
        cx={RANKED.right}
        cy={RANKED.firstRowY}
        r="2.5"
      />

      {/* ---------- 4. Review (glass) ---------- */}
      <text className={styles.stage} x="150" y="188">
        REVIEW
      </text>
      <rect className={styles.glassPanel} x="150" y="196" width="150" height="76" rx="4" />
      <text className={styles.labelMuted} x="162" y="220">
        Platform Engineering
      </text>
      <line className={styles.structure} x1="162" y1="230" x2="288" y2="230" />
      <text className={styles.labelMono} x="162" y="250">
        proposal · pending
      </text>
      <text className={styles.labelMono} x="162" y="264">
        department decides
      </text>

      {/* review → active team — solid, because it has been accepted */}
      <path className={styles.accepted} d="M225 272 V330" />
      <path className={styles.accepted} d="M220 325 l5 6 5 -6" />

      {/* ---------- 5. Active team ---------- */}
      <text className={styles.stage} x="0" y="330">
        ACTIVE TEAM
      </text>
      <rect className={styles.node} x="0" y="340" width="450" height="54" rx="4" />
      <PersonMark x={26} y={367} scale={1.3} className={styles.personSelected} />
      <text className={styles.label} x="44" y="364">
        Mert Aydogan
      </text>
      <text className={styles.labelMono} x="44" y="380">
        accepted · 6 / 8 h
      </text>
      <line className={styles.structure} x1="210" y1="352" x2="210" y2="382" />
      <text className={styles.labelMuted} x="228" y="364">
        Backend Engineer
      </text>
      <text className={styles.labelMono} x="228" y="380">
        Project Orion
      </text>

      {/* ---------- legend: the distinction, stated in words as well as line ---------- */}
      <path className={styles.proposed} d="M478 352 H514" />
      <text className={styles.labelMono} x="522" y="356">
        proposal
      </text>
      <path className={styles.accepted} d="M478 376 H514" />
      <text className={styles.labelMono} x="522" y="380">
        accepted
      </text>
    </svg>
  );
}

/**
 * The 390px composition.
 *
 * A single vertical spine with the same five stages. The candidate list keeps
 * all three people because the ranking is the point, but the requirement detail
 * collapses to the technologies and the open roles count — the two things that
 * still mean something at this width.
 *
 * Every card used to span the full 0–320 `viewBox`, which clipped both vertical
 * strokes. They are inset by 10 now. The spine stays on x=160, which is still
 * the centre of the inset card.
 */
function MobileFlow() {
  return (
    <svg
      className={styles.mobile}
      viewBox="0 0 320 470"
      role="img"
      aria-labelledby={CAPTION_ID}
      aria-describedby={DESC_ID}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* 1. Requirements */}
      <text className={styles.stage} x="10" y="10">
        REQUIREMENTS
      </text>
      <rect className={styles.node} x="10" y="18" width="300" height="72" rx="4" />
      <text className={styles.label} x="22" y="40">
        Project Orion
      </text>
      <line className={styles.structure} x1="22" y1="50" x2="298" y2="50" />
      <text className={styles.labelMono} x="22" y="66">
        Java · PostgreSQL · React
      </text>
      <text className={styles.labelMuted} x="22" y="82">
        4 open team roles
      </text>

      <path className={styles.structure} d="M160 90 V112" />
      <path className={styles.structure} d="M155 107 l5 6 5 -6" />

      {/* 2. Evidence */}
      <text className={styles.stage} x="10" y="126">
        EVIDENCE
      </text>
      <rect className={styles.glassPanel} x="10" y="134" width="300" height="46" rx="4" />
      <text className={styles.labelMuted} x="22" y="154">
        skills · past projects · capacity
      </text>
      <text className={styles.labelMono} x="22" y="171">
        deterministic
      </text>

      <path className={styles.structure} d="M160 180 V202" />
      <path className={styles.structure} d="M155 197 l5 6 5 -6" />

      {/* 3. Ranked candidates */}
      <text className={styles.stage} x="10" y="216">
        RANKED CANDIDATES
      </text>
      <rect className={styles.node} x="10" y="224" width="300" height="96" rx="4" />
      {CANDIDATES.map((candidate, index) => {
        const y = 246 + index * 28;
        return (
          <g key={candidate.name}>
            {candidate.selected ? (
              <rect className={styles.rowMark} x="14" y={y - 10} width="3" height="20" rx="1.5" />
            ) : null}
            <PersonMark
              x={28}
              y={y - 4}
              className={candidate.selected ? styles.personSelected : styles.person}
            />
            <text
              className={candidate.selected ? styles.label : styles.labelMuted}
              x="44"
              y={y}
            >
              {candidate.name}
            </text>
            <text className={styles.score} x="298" y={y} textAnchor="end">
              {candidate.score}
            </text>
            {index < CANDIDATES.length - 1 ? (
              <line className={styles.structure} x1="22" y1={y + 10} x2="298" y2={y + 10} />
            ) : null}
          </g>
        );
      })}

      {/* proposal — dashed. It leaves below the card, so it crosses no row. */}
      <path className={styles.proposed} d="M160 320 V342" />
      <path className={styles.proposed} d="M155 337 l5 6 5 -6" />

      {/* 4. Review */}
      <text className={styles.stage} x="10" y="356">
        REVIEW
      </text>
      <rect className={styles.glassPanel} x="10" y="364" width="300" height="44" rx="4" />
      <text className={styles.labelMuted} x="22" y="383">
        Platform Engineering
      </text>
      <text className={styles.labelMono} x="22" y="399">
        proposal · pending
      </text>

      {/* accepted — solid */}
      <path className={styles.accepted} d="M160 408 V430" />
      <path className={styles.accepted} d="M155 425 l5 6 5 -6" />

      {/* 5. Active team */}
      <text className={styles.stage} x="10" y="444">
        ACTIVE TEAM
      </text>
      <rect className={styles.node} x="10" y="450" width="300" height="20" rx="4" />
      <PersonMark x={26} y={460} scale={0.9} className={styles.personSelected} />
      <text className={styles.labelMono} x="40" y="464">
        Mert Aydogan · accepted · 6 / 8 h
      </text>
    </svg>
  );
}
