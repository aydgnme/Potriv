import type { ReactNode } from "react";

import { Alert } from "@/shared/ui/Alert";

/**
 * A section that could not load says so where it sits, and the rest of Home
 * carries on. The message never carries a status code, a path or anything else
 * from the backend — none of it helps the reader, and some of it is a leak.
 */
export function SectionError({ children }: { readonly children: ReactNode }) {
  return <Alert tone="warning">{children}</Alert>;
}
