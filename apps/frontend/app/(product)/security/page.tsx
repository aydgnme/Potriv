import type { Metadata } from "next";

import { SecurityPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "Security — Controls, evidence and what is not claimed",
  description:
    "No certifications are claimed " +
    "Session handling, authorization and isolation, delivery gates and allocation governance — each with its evidence and its limit.",
};

export default function Page() {
  return <SecurityPage />;
}
