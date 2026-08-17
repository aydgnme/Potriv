/**
 * A restrained line mark beside each role heading.
 *
 * Deliberately one shared glyph rather than four illustrated icons: the roles
 * are distinguished by their names and their sentences, and four little pictures
 * would invite the reader to decode a picture instead of reading the sentence.
 * It is `aria-hidden` because it carries nothing the heading does not already
 * say.
 */
export function RoleGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="0.75"
        y="0.75"
        width="12.5"
        height="12.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M4 7h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
