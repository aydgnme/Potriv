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
 * Headers every route gets, whatever it renders.
 *
 * These are deliberately *not* in `middleware.ts`. The middleware runs only on
 * the credential-bearing routes, and a transport or sniffing protection that
 * covers five pages covers nothing: an HTML response mislabelled as
 * `text/plain` is as dangerous on `/product` as on `/login`.
 *
 * The Content-Security-Policy is the exception and stays in the middleware,
 * because it is nonce-based and a nonce cannot come from a static config.
 */
const BASELINE_SECURITY_HEADERS = [
  /* Stops a browser from second-guessing a declared Content-Type — the step
     that turns an uploaded or reflected file into executable script. */
  { key: "X-Content-Type-Options", value: "nosniff" },
  /*
    Two years, subdomains included, preload-eligible.

    Emitted unconditionally: browsers ignore it on plain http, so there is no
    localhost hazard, and making it conditional on a runtime "are we behind
    TLS" guess is how a deployment ends up shipping without it.
  */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  /* Nothing here uses a camera, a microphone, a location or a payment handler.
     Denying them outright means an injected script cannot prompt for one. */
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), " +
      "encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), " +
      "magnetometer=(), microphone=(), midi=(), payment=(), " +
      "picture-in-picture=(), publickey-credentials-get=(), " +
      "screen-wake-lock=(), usb=(), xr-spatial-tracking=()",
  },
  /* `frame-ancestors 'none'` in the CSP is the real control and covers the
     sensitive routes; this covers every other route and the browsers that
     still only read the older header. */
  { key: "X-Frame-Options", value: "DENY" },
];

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
    /* Emit the minimal Node.js server bundle consumed by the production
       container. Runtime-only values such as POTRIV_BACKEND_BASE_URL stay out
       of the image and are supplied by the orchestrator when the container
       starts. */
    output: "standalone",
    pageExtensions: isDevelopmentServer
      ? [...DEVELOPMENT_ONLY_EXTENSIONS, ...ROUTABLE_EXTENSIONS]
      : ROUTABLE_EXTENSIONS,
    /* `X-Powered-By: Next.js` names the framework and, with it, the CVE list
       worth trying. It buys nothing. */
    poweredByHeader: false,
    headers: async () => [
      { source: "/:path*", headers: BASELINE_SECURITY_HEADERS },
      {
        /**
         * The invite page carries a credential in its URL fragment.
         *
         * A fragment is never sent to a server and browsers already strip it
         * from `Referer`, so this is not what keeps the token out of other
         * origins' logs — the fragment itself does that. What this removes is
         * the remaining signal: without it, following any link from this page
         * would tell the destination that this person is mid-invite, which is
         * an account they do not have yet and a workspace they have not joined.
         *
         * The page clears the fragment on mount regardless. This is the header
         * that holds while the page is still loading.
         */
        source: "/invite",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        /* The reset link carries the same kind of credential, and a worse one:
           it takes over an account that already exists. Same rule. */
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ],
  };
}

/**
 * Exported for the contract tests: that the two extension lists stay disjoint
 * and `app/(dev)/**` is named only by the development-only one, and that the
 * baseline header set keeps the entries the security review requires.
 */
export {
  BASELINE_SECURITY_HEADERS,
  DEVELOPMENT_ONLY_EXTENSIONS,
  ROUTABLE_EXTENSIONS,
};
