import type { Metadata } from "next";

import { ForTeamsPage } from "@/modules/marketing";

export const metadata: Metadata = {
  title: "For teams — Who owns each decision",
  description:
    "Four responsibilities, a matrix of what each may and may not do read from the authority the system enforces, and the hand-off between them.",
};

export default function Page() {
  return <ForTeamsPage />;
}
