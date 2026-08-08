import type { Metadata } from "next";
import Link from "next/link";

import "@/dev-console/console.css";

/**
 * Developer console chrome. Deliberately separate from the product: it keeps its
 * own dark theme, its own stylesheet and its own metadata, and Next code-splits
 * that CSS to these routes so it never reaches a product page.
 *
 * Nothing here may be reused by the product, and the product must never import
 * this group's token store or API client.
 */
export const metadata: Metadata = {
  title: "Potriv Backend Control Console",
  description: "Developer console for the Potriv backend API",
};

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dev-console-root">
      <header className="topbar">
        <h1>Potriv Backend Control Console</h1>
        <nav className="row">
          <Link href="/console">Console</Link>
        </nav>
        <p className="hint">dev/demo console — not the product UI</p>
      </header>
      {children}
    </div>
  );
}
