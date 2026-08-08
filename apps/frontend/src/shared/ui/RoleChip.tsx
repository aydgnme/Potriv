import type { AccessRole } from "@/shared/types/accessRole";
import { roleLabel } from "@/shared/types/accessRole";

import styles from "./RoleChip.module.css";

export type RoleChipProps = {
  readonly role: AccessRole;
};

/**
 * A role, in sentence case and without colour. Roles are not a status, so they
 * must not compete with one — enum values are never shown raw.
 */
export function RoleChip({ role }: RoleChipProps) {
  return <span className={styles.chip}>{roleLabel(role)}</span>;
}
