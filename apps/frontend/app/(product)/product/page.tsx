import type { Metadata } from "next";

import { ProductPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "Product — Four things Potriv keeps straight",
  description:
    "People and their skills, project requirements, candidate evidence, and a " +
    "staffing decision somebody is accountable for.",
};

export default function Page() {
  return <ProductPage />;
}
