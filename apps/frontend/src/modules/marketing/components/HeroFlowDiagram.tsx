import { PersonMark } from "./PersonMark";
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
 */

/** Demonstration content. Deliberately inert: no product behaviour reads this. */
const CANDIDATES = [
  { name: "Mert Aydogan", score: "80", selected: true },
  { name: "Ana Popescu", score: "72", selected: false },
  { name: "Ioana Marin", score: "68", selected: false },
] as const;

const TITLE_ID = "hero-flow-title";
const DESC_ID = "hero-flow-desc";

const TITLE = "How Potriv staffs a project";
const DESC =
  "Project requirements produce evidence, evidence ranks candidates, a proposal " +
  "goes to the owning department for review, and only an accepted proposal " +
  "becomes part of the active team. Proposals are drawn as dashed lines and " +
  "accepted allocations as solid lines.";

export function HeroFlowDiagram() {
  return (
    <figure className={styles.figure}>
      {/*
        Both variants are in the DOM and CSS hides one. A `display: none` subtree
        is outside the accessibility tree, so exactly one labelled image is
        exposed at any width — the reader never meets the same figure twice.
        Their title/desc ids are suffixed apart so the two never collide.
      */}
      <DesktopFlow />
      <MobileFlow />
    </figure>
  );
}

function DesktopFlow() {
  return (
    <svg
      className={styles.desktop}
      viewBox="0 0 720 400"
      role="img"
      aria-labelledby={`${TITLE_ID} ${DESC_ID}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={TITLE_ID}>{TITLE}</title>
      <desc id={DESC_ID}>{DESC}</desc>

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
      <text className={styles.stage} x="440" y="12">
        RANKED CANDIDATES
      </text>
      <rect className={styles.node} x="440" y="22" width="280" height="118" rx="4" />
      {CANDIDATES.map((candidate, index) => {
        const y = 44 + index * 32;
        return (
          <g key={candidate.name}>
            <PersonMark
              x={458}
              y={y - 4}
              scale={1.15}
              className={candidate.selected ? styles.personSelected : styles.person}
            />
            <text className={styles.labelMuted} x="474" y={y}>
              {candidate.name}
            </text>
            <text className={styles.score} x="690" y={y} textAnchor="end">
              {candidate.score}
            </text>
            {index < CANDIDATES.length - 1 ? (
              <line className={styles.structure} x1="452" y1={y + 12} x2="700" y2={y + 12} />
            ) : null}
          </g>
        );
      })}

      {/* selected candidate drops into review — dashed, because it is a proposal */}
      <path className={styles.proposed} d="M458 48 V210 H300" />
      <path className={styles.proposed} d="M306 205 l-6 5 6 5" />

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
 */
function MobileFlow() {
  return (
    <svg
      className={styles.mobile}
      viewBox="0 0 320 470"
      role="img"
      aria-labelledby={`${TITLE_ID}-m ${DESC_ID}-m`}
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={`${TITLE_ID}-m`}>{TITLE}</title>
      <desc id={`${DESC_ID}-m`}>{DESC}</desc>

      {/* 1. Requirements */}
      <text className={styles.stage} x="0" y="10">
        REQUIREMENTS
      </text>
      <rect className={styles.node} x="0" y="18" width="320" height="72" rx="4" />
      <text className={styles.label} x="12" y="40">
        Project Orion
      </text>
      <line className={styles.structure} x1="12" y1="50" x2="308" y2="50" />
      <text className={styles.labelMono} x="12" y="66">
        Java · PostgreSQL · React
      </text>
      <text className={styles.labelMuted} x="12" y="82">
        4 open team roles
      </text>

      <path className={styles.structure} d="M160 90 V112" />
      <path className={styles.structure} d="M155 107 l5 6 5 -6" />

      {/* 2. Evidence */}
      <text className={styles.stage} x="0" y="126">
        EVIDENCE
      </text>
      <rect className={styles.glassPanel} x="0" y="134" width="320" height="46" rx="4" />
      <text className={styles.labelMuted} x="12" y="154">
        skills · past projects · capacity
      </text>
      <text className={styles.labelMono} x="12" y="171">
        deterministic
      </text>

      <path className={styles.structure} d="M160 180 V202" />
      <path className={styles.structure} d="M155 197 l5 6 5 -6" />

      {/* 3. Ranked candidates */}
      <text className={styles.stage} x="0" y="216">
        RANKED CANDIDATES
      </text>
      <rect className={styles.node} x="0" y="224" width="320" height="96" rx="4" />
      {CANDIDATES.map((candidate, index) => {
        const y = 246 + index * 28;
        return (
          <g key={candidate.name}>
            <PersonMark
              x={18}
              y={y - 4}
              className={candidate.selected ? styles.personSelected : styles.person}
            />
            <text className={styles.labelMuted} x="34" y={y}>
              {candidate.name}
            </text>
            <text className={styles.score} x="308" y={y} textAnchor="end">
              {candidate.score}
            </text>
            {index < CANDIDATES.length - 1 ? (
              <line className={styles.structure} x1="12" y1={y + 10} x2="308" y2={y + 10} />
            ) : null}
          </g>
        );
      })}

      {/* proposal — dashed */}
      <path className={styles.proposed} d="M160 320 V342" />
      <path className={styles.proposed} d="M155 337 l5 6 5 -6" />

      {/* 4. Review */}
      <text className={styles.stage} x="0" y="356">
        REVIEW
      </text>
      <rect className={styles.glassPanel} x="0" y="364" width="320" height="44" rx="4" />
      <text className={styles.labelMuted} x="12" y="383">
        Platform Engineering
      </text>
      <text className={styles.labelMono} x="12" y="399">
        proposal · pending
      </text>

      {/* accepted — solid */}
      <path className={styles.accepted} d="M160 408 V430" />
      <path className={styles.accepted} d="M155 425 l5 6 5 -6" />

      {/* 5. Active team */}
      <text className={styles.stage} x="0" y="444">
        ACTIVE TEAM
      </text>
      <rect className={styles.node} x="0" y="450" width="320" height="20" rx="4" />
      <PersonMark x={16} y={460} scale={0.9} className={styles.personSelected} />
      <text className={styles.labelMono} x="30" y="464">
        Mert Aydogan · accepted · 6 / 8 h
      </text>
    </svg>
  );
}
