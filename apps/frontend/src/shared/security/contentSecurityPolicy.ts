/**
 * The Content-Security-Policy the credential-bearing pages are served under.
 *
 * Kept out of `middleware.ts` so it can be unit-tested directly. The middleware
 * is the only caller; nothing else should assemble a policy.
 *
 * ## Why these pages and not the whole product
 *
 * `/invite`, `/reset-password`, `/forgot-password`, `/login` and
 * `/create-workspace` are the pages where a credential is in the browser: two
 * of them receive a live token in the URL fragment, the other three take a
 * password. A script that can run on one of these pages can read the token out
 * of the fragment before the page scrubs it, or key-log the password field.
 * That is a different threat from the rest of the product, and it gets a
 * different policy.
 *
 * ## Why a nonce and not a hash
 *
 * Next's App Router emits inline bootstrap scripts (`self.__next_f.push(...)`)
 * whose contents change with the route's payload, so their hashes are not
 * knowable at build time. Next does, however, stamp its own script tags with a
 * nonce when it finds one in the request's `Content-Security-Policy` header —
 * which is the mechanism the middleware uses. A hash-based policy would have to
 * be regenerated on every content change and would silently start blocking
 * hydration the first time somebody forgot.
 *
 * A nonce forces per-request rendering. Every route in {@link SENSITIVE_ROUTES}
 * therefore declares `dynamic = "force-dynamic"`; a statically prerendered page
 * would carry no nonce and its own hydration script would be blocked. The
 * contract test in `contentSecurityPolicy.test.ts` pins that pairing.
 */

/**
 * The pages served under the strict policy.
 *
 * Exact paths. A prefix match would extend the policy — and the
 * force-dynamic requirement that comes with it — to routes nobody reviewed.
 */
export const SENSITIVE_ROUTES: readonly string[] = [
  "/invite",
  "/reset-password",
  "/forgot-password",
  "/login",
  "/create-workspace",
  "/create-workspace/verify",
];

export function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_ROUTES.includes(pathname);
}

/**
 * Builds the policy for one request.
 *
 * `development` exists because the Next development server serves React Refresh
 * through `eval`, and its overlay injects unnonced inline styles. Neither is
 * present in a production build, and neither is permitted there — the contract
 * test asserts that `'unsafe-eval'` never appears in the production string,
 * because a policy that allows `eval` on a page holding a reset token is not a
 * policy, it is a comment.
 */
export function buildContentSecurityPolicy(options: {
  readonly nonce: string;
  readonly development: boolean;
}): string {
  const { nonce, development } = options;

  /*
    `'self'` alongside the nonce, and deliberately no `'strict-dynamic'`.

    `'strict-dynamic'` is the usual advice, but it makes CSP3 browsers *ignore*
    `'self'`: any script the nonced bootstrap loads is then trusted whatever its
    origin. Next loads its chunks from this origin with `<script src>` tags that
    it nonces itself, so the origin allow-list is sufficient here and keeping it
    means an injected `document.createElement('script')` pointing at another
    host is still refused.
  */
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // React Refresh only. Never reachable in a production build.
    development ? "'unsafe-eval'" : null,
  ].filter(Boolean);

  /*
    React writes `style` attributes for a handful of inline layout values, and
    an attribute cannot carry a nonce. `style-src-attr 'unsafe-inline'` permits
    exactly those and nothing else: `style-src` itself stays nonce-and-origin
    only, so an injected `<style>` element is still blocked.
  */
  const styleSrc = ["'self'", `'nonce-${nonce}'`, development ? "'unsafe-inline'" : null]
    .filter(Boolean);

  const directives: Array<readonly [string, string]> = [
    ["default-src", "'self'"],
    ["script-src", scriptSrc.join(" ")],
    ["style-src", styleSrc.join(" ")],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self' data: blob:"],
    ["font-src", "'self'"],
    /*
      Same-origin only. Every backend call on these pages goes through this
      app's own BFF routes under `/api/auth/**`, so there is no third-party
      endpoint to allow — and no analytics or RUM collector can be added to
      these pages without this line failing first, which is the point.
      The development server needs its websocket for hot reload.
    */
    ["connect-src", development ? "'self' ws: wss:" : "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["frame-ancestors", "'none'"],
    ["frame-src", "'none'"],
    ["form-action", "'self'"],
    ["worker-src", "'self' blob:"],
    ["manifest-src", "'self'"],
  ];

  if (!development) {
    // Meaningless on http://localhost, and it breaks the development server.
    directives.push(["upgrade-insecure-requests", ""]);
  }

  return directives
    .map(([name, value]) => (value ? `${name} ${value}` : name))
    .join("; ");
}

/**
 * A per-request nonce.
 *
 * 16 bytes of `crypto.getRandomValues`, base64. `crypto.randomUUID` is the
 * shape Next's own example uses, but a UUID is 122 bits with six of them
 * fixed by the version and variant fields; this is 128 unbiased bits and costs
 * nothing extra. `Math.random` would be a predictable nonce, which is the same
 * as no nonce at all.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
