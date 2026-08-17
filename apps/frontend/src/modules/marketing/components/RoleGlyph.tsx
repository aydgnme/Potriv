/**
 * A person, and the thing that person owns.
 *
 * Each role gets the same bust and a different context mark, because the roles
 * differ by *what they are responsible for* rather than by who they are:
 *
 *   project manager     person + a project node
 *   department manager  person + a department tree
 *   organization admin  person + an organization topology
 *   employee            person + skill nodes
 *
 * One shared figure and four small marks, rather than four illustrated
 * characters — the sentence beside each row does the explaining, and the glyph
 * only has to say "a person, responsible for this shape of thing". No colour
 * varies by role: a per-role hue would invent a taxonomy the product does not
 * have.
 *
 * Entirely decorative. Every one sits beside a heading that already names the
 * role, so none of them is hidden information.
 */

export type RoleContext = "project" | "department" | "organization" | "skills";

const CONTEXTS: Record<RoleContext, React.ReactNode> = {
  // A single project node.
  project: <rect x="18.5" y="7.5" width="9" height="9" rx="1.5" />,

  // A department: one parent, two reports.
  department: (
    <>
      <path d="M23 6v3M18.5 12.5h9M18.5 12.5v2M27.5 12.5v2" />
      <rect x="21" y="3.5" width="4" height="3" rx="0.8" />
      <rect x="16.5" y="14.5" width="4" height="3" rx="0.8" />
      <rect x="25.5" y="14.5" width="4" height="3" rx="0.8" />
    </>
  ),

  // An organization: a structure of connected units.
  organization: (
    <>
      <rect x="17" y="4" width="5" height="4" rx="0.8" />
      <rect x="24" y="4" width="5" height="4" rx="0.8" />
      <rect x="20.5" y="13" width="5" height="4" rx="0.8" />
      <path d="M19.5 8v2.5h7V8M23 10.5V13" />
    </>
  ),

  // Skills: declared, at different levels.
  skills: (
    <>
      <path d="M18 16.5v-3M21.5 16.5v-6M25 16.5v-4.5M28.5 16.5v-8" />
      <circle cx="18" cy="12" r="1.1" />
      <circle cx="21.5" cy="9" r="1.1" />
      <circle cx="25" cy="10.5" r="1.1" />
      <circle cx="28.5" cy="7" r="1.1" />
    </>
  ),
};

export function RoleGlyph({
  context,
  className,
}: {
  readonly context: RoleContext;
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      width="32"
      height="20"
      viewBox="0 0 32 20"
      aria-hidden="true"
      focusable="false"
    >
      {/* the person: same geometry as PersonGlyph, at this composition's scale */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <circle cx="7" cy="6" r="2.8" />
        <path d="M1.4 16.5a5.6 5.6 0 0 1 11.2 0" />
      </g>

      {/* the responsibility, in brand teal as a micro-accent */}
      <g
        stroke="var(--p-brand-line)"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {CONTEXTS[context]}
      </g>
    </svg>
  );
}
