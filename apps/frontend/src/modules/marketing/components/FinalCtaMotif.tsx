import { PersonMark } from "@/shared/ui/PersonMark";

/**
 * The closing motif: a department, a project, and the team that results.
 *
 * The earlier version drew two labelled boxes resolving into a third, which was
 * accurate and said nothing about who any of it is for. This one puts people in
 * it — a department that holds three of them, a project that needs them, and an
 * active team made of the ones whose allocation was accepted.
 *
 * It restates the page's one rule at the point of decision: the request from the
 * project to the department is **dashed**, because it is a proposal; what comes
 * out the other side is **solid**, because it was accepted. Line pattern carries
 * that, not colour.
 *
 * Supportive, not dominant: it sits beside the closing headline and must not
 * compete with it, so it stays monoline, small, and almost entirely neutral —
 * teal appears only on the accepted path and the staffed team.
 *
 * Decorative. The heading and body beside it already say all of this, so it is
 * hidden from assistive technology rather than repeating them.
 */

export function FinalCtaMotif({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="268"
      height="188"
      viewBox="0 0 268 188"
      aria-hidden="true"
      focusable="false"
    >
      {/* ---------- department: holds people ---------- */}
      <rect
        x="0.5"
        y="10.5"
        width="122"
        height="52"
        rx="3"
        fill="var(--p-surface)"
        stroke="var(--p-border-strong)"
      />
      <text
        x="12"
        y="26"
        fill="var(--p-text-muted)"
        fontFamily="var(--p-font-mono)"
        fontSize="9.5"
      >
        department
      </text>
      {/* neutral people: in the department, not yet allocated anywhere */}
      <g
        stroke="var(--p-text-muted)"
        strokeWidth="1.1"
        fill="var(--p-surface)"
        strokeLinecap="round"
      >
        <PersonMark x={26} y={44} />
        <PersonMark x={52} y={44} />
        <PersonMark x={78} y={44} />
      </g>

      {/* ---------- project: needs them ---------- */}
      <rect
        x="0.5"
        y="112.5"
        width="122"
        height="40"
        rx="3"
        fill="var(--p-surface)"
        stroke="var(--p-border-strong)"
      />
      <text
        x="12"
        y="130"
        fill="var(--p-text)"
        fontFamily="var(--p-font-sans)"
        fontSize="10.5"
        fontWeight="600"
      >
        Project Orion
      </text>
      <text
        x="12"
        y="144"
        fill="var(--p-text-muted)"
        fontFamily="var(--p-font-mono)"
        fontSize="9"
      >
        2 open team roles
      </text>

      {/* ---------- the request: dashed, because it is only a proposal ---------- */}
      <path
        d="M122 132 H150 V70"
        fill="none"
        stroke="var(--p-brand-line)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <path
        d="M145 73 l5 -6 5 6"
        fill="none"
        stroke="var(--p-brand-line)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Right-aligned to the left of the dashed run, so the label sits in clear
          space instead of across the line it is naming. */}
      <text
        x="146"
        y="100"
        textAnchor="end"
        fill="var(--p-text-muted)"
        fontFamily="var(--p-font-mono)"
        fontSize="8.5"
      >
        proposal
      </text>

      {/* Review, where the department decides.
          Flat and bordered rather than glass: this motif sits on plain white,
          where a 10%-alpha glass edge is invisible and the step would read as a
          floating word. Glass stays where it earns its keep — the hero. */}
      <rect
        x="126.5"
        y="40.5"
        width="46"
        height="24"
        rx="3"
        fill="var(--p-surface)"
        stroke="var(--p-border-strong)"
      />
      <text
        x="134"
        y="56"
        fill="var(--p-text-muted)"
        fontFamily="var(--p-font-mono)"
        fontSize="8.5"
      >
        review
      </text>

      {/* ---------- the outcome: solid, because it was accepted ----------
          It has to land *on* the active team box. A line that stops in open
          space beside it would be asserting a relationship it never completes. */}
      <path
        d="M173 52 H210 V68"
        fill="none"
        stroke="var(--p-brand)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M205 63 l5 6 5 -6"
        fill="none"
        stroke="var(--p-brand)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* ---------- active team ---------- */}
      <rect
        x="180.5"
        y="72.5"
        width="86"
        height="52"
        rx="3"
        fill="var(--p-brand-soft)"
        stroke="var(--p-brand)"
      />
      <text
        x="192"
        y="88"
        fill="var(--p-brand-strong)"
        fontFamily="var(--p-font-mono)"
        fontSize="9.5"
      >
        active team
      </text>
      {/* the two whose allocation was accepted, in brand tint */}
      <g
        stroke="var(--p-brand)"
        strokeWidth="1.1"
        fill="var(--p-brand-selection)"
        strokeLinecap="round"
      >
        <PersonMark x={204} y={106} />
        <PersonMark x={232} y={106} />
      </g>
    </svg>
  );
}
