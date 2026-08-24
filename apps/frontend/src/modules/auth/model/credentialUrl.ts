/**
 * Taking a credential out of the address bar.
 *
 * Two pages are reached by an emailed link that carries a token: `/invite` and
 * `/reset-password`. Both read it once into memory and must then leave nothing
 * behind, because an address bar is shared in ways a request never is — a
 * screenshot, a screen share, a bookmark, browser sync, someone reading over a
 * shoulder, or a `Referer` if a later navigation is added.
 *
 * Two rules, and the second is the one that was missing:
 *
 *  1. the fragment goes entirely — it is where the token is supposed to be;
 *  2. any *query* parameter that names a credential goes too. The pages do not
 *     accept a query token, but refusing to read one is not the same as
 *     removing it: `/reset-password?token=SECRET` was rejected and then left
 *     sitting in the address bar, which is the copy that actually gets shared.
 *
 * Non-credential query parameters survive, because they are how a link says
 * where it came from and removing them would break ordinary navigation.
 */

/** Query parameter names that carry a credential in this application. */
export const CREDENTIAL_PARAMETERS: readonly string[] = [
  "token",
  "inviteToken",
  "resetToken",
];

/**
 * Reads a token out of a fragment.
 *
 * A fragment is not a query string, but it is encoded like one, so the same
 * parser reads it once the leading `#` is dropped. Only the fragment is
 * consulted: a token that arrived in the query string has already been sent to
 * a server and is treated as disclosed, never as a usable credential.
 */
export function tokenFromFragment(fragment: string): string {
  const body = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return new URLSearchParams(body).get("token") ?? "";
}

/**
 * The same URL with every credential removed: no fragment, and no query
 * parameter that names one.
 *
 * Built with the `URL` API rather than string concatenation so that encoding,
 * repeated parameters and empty-query edge cases are handled by the parser
 * rather than by us. Returns a path-relative string, which is what
 * `history.replaceState` wants and what keeps the origin out of the entry.
 */
export function scrubbedUrl(href: string): string {
  const url = new URL(href);

  for (const parameter of CREDENTIAL_PARAMETERS) {
    // `delete` removes every occurrence, which matters: a repeated `?token=a&token=b`
    // would otherwise leave one behind.
    url.searchParams.delete(parameter);
  }
  url.hash = "";

  const query = url.searchParams.toString();
  return url.pathname + (query ? `?${query}` : "");
}

/**
 * Rewrites the current address bar entry with the credential removed.
 *
 * `replaceState`, never `pushState`: pushing would leave the original entry in
 * session history, so Back would put the token straight back into the address
 * bar and into any later `Referer`.
 */
export function scrubLocation(): void {
  window.history.replaceState(null, "", scrubbedUrl(window.location.href));
}
