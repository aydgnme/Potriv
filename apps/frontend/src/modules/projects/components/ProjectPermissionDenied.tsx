import Link from "next/link";

import type { ReactNode } from "react";

import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

import styles from "./Projects.module.css";

export type ProjectPermissionDeniedProps = {
  readonly children: ReactNode;
};

/**
 * What someone is told when their roles do not cover this screen.
 *
 * Said in capability terms — what the product requires — and never in terms of
 * the object behind it, because that would confirm something about a project they
 * are not entitled to know anything about.
 */
export function ProjectPermissionDenied({ children }: ProjectPermissionDeniedProps) {
  return (
    <div className={styles.page}>
      <PageHeader title="Projects" />
      <EmptyState
        title="You do not have access to this."
        description={children}
        action={<Link href="/projects">Back to projects</Link>}
      />
    </div>
  );
}
