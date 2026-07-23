import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Potriv Backend Control Console",
  description: "Developer console for the Potriv backend API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <h1>Potriv Backend Control Console</h1>
          <nav className="row">
            <Link href="/">Home</Link>
            <Link href="/console">Console</Link>
          </nav>
          <p className="hint">dev/demo console — not the product UI</p>
        </header>
        {children}
      </body>
    </html>
  );
}
