import type { Metadata } from "next";

import { ProductPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "Product — What Potriv keeps straight",
  description:
    "The objects a staffing decision needs — people, skills, departments, projects, requirements, proposals and allocations — and the boundary where a ranking stops being evidence and a person has to decide.",
};

export default function Page() {
  return <ProductPage />;
}
