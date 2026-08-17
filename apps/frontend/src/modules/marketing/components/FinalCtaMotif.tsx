/**
 * The small technical line motif beside the closing call to action.
 *
 * It restates the page's one visual rule in miniature — a dashed proposal
 * resolving into a solid allocation — so the last thing seen is the same idea
 * the hero opened with. Decorative: the sentence beside it already carries the
 * meaning, so it is hidden from assistive technology.
 */
export function FinalCtaMotif({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="240"
      height="150"
      viewBox="0 0 240 150"
      aria-hidden="true"
      focusable="false"
    >
      {/* one department */}
      <rect
        x="0.5"
        y="20.5"
        width="96"
        height="34"
        rx="3"
        fill="var(--p-surface)"
        stroke="var(--p-border-strong)"
      />
      <text
        x="12"
        y="42"
        fill="var(--p-text-muted)"
        fontFamily="var(--p-font-mono)"
        fontSize="10.5"
      >
        one department
      </text>

      {/* one project */}
      <rect
        x="0.5"
        y="95.5"
        width="96"
        height="34"
        rx="3"
        fill="var(--p-surface)"
        stroke="var(--p-border-strong)"
      />
      <text
        x="12"
        y="117"
        fill="var(--p-text-muted)"
        fontFamily="var(--p-font-mono)"
        fontSize="10.5"
      >
        one project
      </text>

      {/* the proposal, still dashed */}
      <path
        d="M97 37 H150 V70"
        fill="none"
        stroke="var(--p-brand-line)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      {/* the accepted allocation, solid */}
      <path d="M97 112 H150 V82" fill="none" stroke="var(--p-brand)" strokeWidth="2" />

      {/* the staffed team */}
      <rect
        x="150.5"
        y="58.5"
        width="88"
        height="34"
        rx="3"
        fill="var(--p-brand-soft)"
        stroke="var(--p-brand)"
      />
      <circle cx="168" cy="75" r="6" fill="var(--p-surface)" stroke="var(--p-brand)" />
      <text
        x="182"
        y="79"
        fill="var(--p-brand-strong)"
        fontFamily="var(--p-font-mono)"
        fontSize="10.5"
      >
        staffed
      </text>
    </svg>
  );
}
