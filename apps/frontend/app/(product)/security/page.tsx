import type { Metadata } from "next";

import { SecurityPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "Security — What we can state plainly",
  description:
    "No certifications are claimed. Server-managed sessions, backend " +
    "authorization, organization isolation, a dependency audit gate, CI " +
    "quality gates and reviewed allocations.",
};

export default function Page() {
  return <SecurityPage />;
}
