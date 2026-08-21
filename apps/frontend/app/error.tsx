"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The last resort when a render throws.
 *
 * It shows one sentence and no detail. A stack, a backend path or an error
 * envelope on this page would be readable by whoever is holding the laptop, and
 * none of it helps them — the digest is logged for people who can act on it.
 *
 * It also makes **no claim about what did or did not happen**. A server action
 * can commit and the render that follows can still throw, so a boundary this far
 * out has no evidence for "nothing was changed" — and saying it anyway would be
 * reassurance the page cannot back up.
 *
 * `reset()` re-renders the segment. That is safe because rendering is a read;
 * nothing here retries a mutation, which is the one thing a generic retry button
 * must never do. It is not offered as proof of anything either.
 */
export default function ProductError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Server-side digest only — the message itself may carry detail that should
    // not be echoed back into the page.
    console.error("Unhandled error", error.digest);
  }, [error]);

  return (
    <main className="p-system-state">
      <h1>Something went wrong</h1>
      <p>This page could not be displayed. Try again, or return Home.</p>
      <p className="p-system-state-actions">
        <button type="button" onClick={reset}>
          Try again
        </button>
        <Link href="/home">Go to Home</Link>
      </p>
    </main>
  );
}
