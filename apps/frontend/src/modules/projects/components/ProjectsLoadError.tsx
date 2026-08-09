import type { ReactNode } from "react";

import { Alert } from "@/shared/ui/Alert";

export type ProjectsLoadErrorProps = {
  readonly children: ReactNode;
};

/**
 * What a failed list load says.
 *
 * A sentence about this screen and a retry, and nothing else. No status code, no
 * backend path, no exception payload: none of it helps the person reading it,
 * and all of it describes infrastructure they cannot see.
 */
export function ProjectsLoadError({ children }: ProjectsLoadErrorProps) {
  return (
    <Alert tone="warning">
      {children} Refresh the page to try again.
    </Alert>
  );
}
