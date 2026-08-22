import type { Metadata } from "next";

import { HowItWorksPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "How it works — From empty workspace to a reviewed team",
  description:
    "The seven steps from creating a workspace to an accepted allocation, and " +
    "the staffing flow that produces one: requirements, evidence, ranked " +
    "candidates, department review, active team.",
};

export default function Page() {
  return <HowItWorksPage />;
}
