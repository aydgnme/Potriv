import Link from "next/link";

/**
 * A route that does not exist.
 *
 * Deliberately generic, and deliberately **not** wired to domain 404s. Several
 * domains collapse "missing" and "not visible to you" into one sentence on
 * purpose — a project you may not see answers exactly like a project that was
 * never there — and routing those through a global page that says "not found"
 * would turn a refusal into proof of absence.
 *
 * So this covers unknown URLs only. Known-object routes keep their own wording.
 */
export default function NotFound() {
  return (
    <main className="p-system-state">
      <h1>Page not found</h1>
      <p>That address does not match anything in Potriv.</p>
      <p>
        <Link href="/home">Go to Home</Link>
      </p>
    </main>
  );
}
