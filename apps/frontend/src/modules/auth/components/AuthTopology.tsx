import { PersonMark } from "@/shared/ui/PersonMark";

import styles from "./AuthTopology.module.css";

/**
 * The small technical drawing beside each public auth form.
 *
 * One drawing per task, each showing the piece of Potriv's topology that the
 * form is about to act on: signing in reaches a workspace's people and work,
 * an invite adds a person to an organization, a reset restores one account's
 * access, and creating a workspace is the first organization coming into being.
 *
 * Deliberately smaller and quieter than the landing's hero diagram — this is
 * context beside a form, not the subject of the page. All four are decorative:
 * the heading and body beside them already say what the page is for, so none of
 * them carries information a reader could miss.
 */

export type AuthTopologyKind = "signIn" | "createWorkspace" | "invite" | "recover";

const STROKE = {
  fill: "none",
  stroke: "var(--p-border-strong)",
  strokeWidth: 1,
} as const;

export function AuthTopology({ kind }: { kind: AuthTopologyKind }) {
  return (
    <svg
      className={styles.figure}
      viewBox="0 0 260 170"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "signIn" ? <SignIn /> : null}
      {kind === "createWorkspace" ? <CreateWorkspace /> : null}
      {kind === "invite" ? <Invite /> : null}
      {kind === "recover" ? <Recover /> : null}
    </svg>
  );
}

/** workspace → people → project */
function SignIn() {
  return (
    <>
      <rect x="0.5" y="8.5" width="104" height="38" rx="3" {...STROKE} fill="var(--p-surface)" />
      <text className={styles.label} x="12" y="32">
        workspace
      </text>

      <path d="M52 47 V70" {...STROKE} />
      <path d="M47 65 l5 6 5 -6" {...STROKE} />

      <rect x="0.5" y="70.5" width="104" height="42" rx="3" {...STROKE} fill="var(--p-surface)" />
      <g stroke="var(--p-text-muted)" strokeWidth="1.1" fill="var(--p-surface)" strokeLinecap="round">
        <PersonMark x={26} y={92} />
        <PersonMark x={52} y={92} />
        <PersonMark x={78} y={92} />
      </g>

      <path d="M105 91 H150" stroke="var(--p-brand)" strokeWidth="2" fill="none" />
      <path d="M145 86 l6 5 -6 5" stroke="var(--p-brand)" strokeWidth="2" fill="none" />

      <rect
        x="150.5"
        y="70.5"
        width="104"
        height="42"
        rx="3"
        fill="var(--p-brand-soft)"
        stroke="var(--p-brand)"
      />
      <text className={styles.labelBrand} x="162" y="88">
        Project Orion
      </text>
      <text className={styles.labelMono} x="162" y="103">
        active team
      </text>
    </>
  );
}

/** an organization coming into being, with its first administrator */
function CreateWorkspace() {
  return (
    <>
      <rect
        x="0.5"
        y="40.5"
        width="118"
        height="46"
        rx="3"
        fill="var(--p-brand-soft)"
        stroke="var(--p-brand)"
      />
      <text className={styles.labelBrand} x="14" y="60">
        your organization
      </text>
      <g stroke="var(--p-brand)" strokeWidth="1.1" fill="var(--p-brand-selection)" strokeLinecap="round">
        <PersonMark x={26} y={74} />
      </g>
      <text className={styles.labelMono} x="42" y="78">
        first admin
      </text>

      {/* what comes next, still unmade — drawn dashed because none of it exists yet */}
      <path
        d="M119 63 H146"
        stroke="var(--p-brand-line)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        fill="none"
      />
      {["departments", "skills", "projects"].map((label, index) => (
        <g key={label}>
          <rect
            x="150.5"
            y={20.5 + index * 38}
            width="104"
            height="30"
            rx="3"
            fill="var(--p-surface)"
            stroke="var(--p-border)"
            strokeDasharray="4 4"
          />
          <text className={styles.labelMuted} x="162" y={39 + index * 38}>
            {label}
          </text>
        </g>
      ))}
    </>
  );
}

/** organization - - invite - - → person */
function Invite() {
  return (
    <>
      <rect x="0.5" y="58.5" width="104" height="46" rx="3" {...STROKE} fill="var(--p-surface)" />
      <text className={styles.label} x="12" y="80">
        a workspace
      </text>
      <text className={styles.labelMono} x="12" y="95">
        already running
      </text>

      {/* dashed: an invitation is not yet a membership */}
      <path
        d="M105 81 H160"
        stroke="var(--p-brand-line)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        fill="none"
      />
      <path d="M155 76 l6 5 -6 5" stroke="var(--p-brand-line)" strokeWidth="1.5" fill="none" />
      <text className={styles.labelMono} x="112" y="70">
        invite
      </text>

      <rect
        x="164.5"
        y="58.5"
        width="90"
        height="46"
        rx="3"
        fill="var(--p-brand-soft)"
        stroke="var(--p-brand)"
      />
      <g stroke="var(--p-brand)" strokeWidth="1.1" fill="var(--p-brand-selection)" strokeLinecap="round">
        <PersonMark x={186} y={82} />
      </g>
      <text className={styles.labelBrand} x="202" y="86">
        you
      </text>
    </>
  );
}

/** one account, and the access being restored to it */
function Recover() {
  return (
    <>
      <rect x="70.5" y="26.5" width="118" height="46" rx="3" {...STROKE} fill="var(--p-surface)" />
      <g stroke="var(--p-text-muted)" strokeWidth="1.1" fill="var(--p-surface)" strokeLinecap="round">
        <PersonMark x={96} y={44} />
      </g>
      <text className={styles.label} x="112" y="48">
        your account
      </text>
      <text className={styles.labelMono} x="82" y="64">
        email · password
      </text>

      <path
        d="M129 73 V104"
        stroke="var(--p-brand-line)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        fill="none"
      />
      <path d="M124 99 l5 6 5 -6" stroke="var(--p-brand-line)" strokeWidth="1.5" fill="none" />
      <text className={styles.labelMono} x="136" y="92">
        one-time link
      </text>

      <rect
        x="70.5"
        y="106.5"
        width="118"
        height="38"
        rx="3"
        fill="var(--p-brand-soft)"
        stroke="var(--p-brand)"
      />
      <text className={styles.labelBrand} x="82" y="130">
        access restored
      </text>
    </>
  );
}
