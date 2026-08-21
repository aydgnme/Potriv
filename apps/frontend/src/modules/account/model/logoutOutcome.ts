/**
 * What a "sign out everywhere" attempt actually established.
 *
 * Three outcomes, because there are three different facts — and the third is
 * the one that is easy to lose.
 *
 * The BFF clears this browser's cookies as part of handling the request, so a
 * usable response is *evidence that the local sign-out happened*. If the request
 * never produced one — the network dropped, the response was not ok, the body was
 * unreadable — then nothing is known: the route may not have run at all, and the
 * cookies may still be sitting there.
 *
 * Treating that silence as "signed out locally" is worse than it sounds. `/login`
 * redirects an authenticated session straight to `/home`, so a browser that still
 * held valid cookies would be told it had been signed out and then quietly
 * dropped back into the product, never seeing the notice.
 *
 * So the unknown case is not guessed at. It is sent somewhere the **server**
 * settles the question.
 */
export type LogoutOutcome =
  /** The backend confirmed every session was revoked, this one included. */
  | "GLOBAL_CONFIRMED"
  /** The BFF ran and cleared this browser, but the backend did not confirm the rest. */
  | "LOCAL_ONLY_CONFIRMED"
  /** No usable answer. Neither half can be claimed. */
  | "UNCONFIRMED";

/**
 * Classifies a response body, which may be anything at all.
 *
 * `authenticated: false` is required for either confirmed outcome: it is the
 * BFF's own statement that it took the local sign-out path. Without it — even
 * alongside `revokedEverywhere: false` — this is some other response, and the
 * honest answer is that nothing is known.
 */
export function classifyLogoutOutcome(
  responseOk: boolean,
  body: unknown,
): LogoutOutcome {
  if (!responseOk) return "UNCONFIRMED";
  if (typeof body !== "object" || body === null) return "UNCONFIRMED";

  const record = body as { authenticated?: unknown; revokedEverywhere?: unknown };
  if (record.authenticated !== false) return "UNCONFIRMED";

  if (record.revokedEverywhere === true) return "GLOBAL_CONFIRMED";
  if (record.revokedEverywhere === false) return "LOCAL_ONLY_CONFIRMED";

  // Present but not a boolean, or absent: the field exists to carry this answer,
  // so anything else means it was not answered.
  return "UNCONFIRMED";
}

/**
 * Where the browser goes next.
 *
 * The unknown case returns to Account **with a marker**, not to login. Account
 * sits behind the protected layout, which resolves the session on the server:
 * if the cookies really were cleared, that layout redirects to login by itself,
 * and if they were not, Account renders and can say plainly that nothing is
 * confirmed. Either way the answer comes from the server rather than from a
 * guess about a request that failed.
 */
export function destinationFor(outcome: LogoutOutcome): string {
  switch (outcome) {
    case "GLOBAL_CONFIRMED":
      return "/login";
    case "LOCAL_ONLY_CONFIRMED":
      return "/login?logout=local-only";
    case "UNCONFIRMED":
      return "/account?logout=unconfirmed";
  }
}
