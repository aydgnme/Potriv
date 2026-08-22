import type { Metadata } from "next";

import { ForTeamsPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "For teams — Four responsibilities, one workspace",
  description:
    "What a project manager, a department manager, an organization admin and " +
    "an employee each own in Potriv.",
};

export default function Page() {
  return <ForTeamsPage />;
}
