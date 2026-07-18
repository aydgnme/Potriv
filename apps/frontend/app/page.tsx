import Link from "next/link";

import BackendHealthCard from "@/components/BackendHealthCard";
import TokenPanel from "@/components/TokenPanel";

export default function HomePage() {
  return (
    <main className="home">
      <BackendHealthCard />
      <TokenPanel />
      <section className="panel">
        <h2>API Console</h2>
        <p>
          Use the <Link href="/console">generic API console</Link> to log in,
          browse endpoint presets, and call any backend endpoint with or
          without a Bearer token.
        </p>
      </section>
    </main>
  );
}
