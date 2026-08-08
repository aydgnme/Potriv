import type { Metadata } from "next";

import "@/shared/styles/globals.css";

/**
 * Application-global concerns only: the document, the design tokens, and (later)
 * providers. Product chrome belongs to app/(product); developer-console chrome
 * belongs to app/(dev). Neither is allowed to leak into here.
 */
export const metadata: Metadata = {
  title: "Potriv",
  description: "Team allocation and skill matching",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
