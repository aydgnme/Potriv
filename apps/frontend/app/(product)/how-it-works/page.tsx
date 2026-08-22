import type { Metadata } from "next";

import { HowItWorksPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "How it works — From requirement to accepted allocation",
  description:
    "Five stages and seven steps, each with the role accountable for it and the record it leaves behind, plus a worked example of the staffing flow.",
};

export default function Page() {
  return <HowItWorksPage />;
}
