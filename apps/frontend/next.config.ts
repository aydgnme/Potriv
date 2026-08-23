import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

import type { NextConfig } from "next";

/**
 * Next's own default list, restated because `pageExtensions` replaces the
 * default rather than extending it. Every product route — `page.tsx`,
 * `layout.tsx`, `route.ts`, and `proxy.ts` — is named by this list in both
 * branches below, so the gate cannot be satisfied by quietly unbuilding the
 * product.
 */
const ROUTABLE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

/**
 * The same list again, prefixed — `page.dev.tsx`, `layout.dev.tsx`. Only the
 * development server accepts these, and only `app/(dev)/**` uses them.
 */
const DEVELOPMENT_ONLY_EXTENSIONS = ROUTABLE_EXTENSIONS.map(
  (extension) => `dev.${extension}`,
);

/**
 * The developer console (`app/(dev)/`, `/console`) is development-only, and the
 * build is where that is enforced.
 *
 * It was being prerendered into the production output and answering anonymous
 * GETs at `/console`. That was never an authentication bypass — the console
 * holds no credentials of its own and the backend authorizes every call it
 * makes, so nothing leaked through it. It was a request builder and an endpoint
 * enumerator served from the production origin: attack surface with no
 * production reason to exist.
 *
 * The group is named out of the build rather than guarded inside it. A
 * `notFound()` in the layout would have left the route in the manifest and
 * asked it to refuse at request time; naming it out leaves nothing to refuse —
 * no `console.html`, no entry in the manifest, and `/console` falls through to
 * the same 404 as any other unknown URL. `src/dev-console/**` is untouched and
 * still type-checked, linted and tested; only its two route files are renamed.
 *
 * Keyed on the phase rather than `NODE_ENV`, because the question this answers
 * is "is the development server serving this?" and the phase is that question.
 * `next build` never reports the development phase, whatever `NODE_ENV` says.
 */
export default function nextConfig(phase: string): NextConfig {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    pageExtensions: isDevelopmentServer
      ? [...DEVELOPMENT_ONLY_EXTENSIONS, ...ROUTABLE_EXTENSIONS]
      : ROUTABLE_EXTENSIONS,
  };
}

/**
 * Exported for the contract test, which asserts the two lists stay disjoint and
 * that `app/(dev)/**` is named only by the development-only one.
 */
export { DEVELOPMENT_ONLY_EXTENSIONS, ROUTABLE_EXTENSIONS };
