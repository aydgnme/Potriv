/**
 * Validates where a user may be sent back to after a controlled refresh.
 *
 * The refresh route sets credentials and then redirects, which makes an
 * unvalidated `returnTo` an open redirect with a session attached. Only local
 * product paths are accepted, and anything else falls back to `/home` rather
 * than being repaired — guessing at what an attacker meant is not a service.
 *
 * Rejected, each for its own reason:
 *   https://evil.example   absolute origin
 *   //evil.example         protocol-relative, which browsers treat as absolute
 *   /\evil.example         backslash, which some parsers normalise to //
 *   javascript:alert(1)    scheme
 *   /api/...               BFF endpoints are not navigation targets
 */

export const DEFAULT_RETURN_TO = "/home";

export function safeReturnTo(candidate: string | null | undefined): string {
  if (!candidate) return DEFAULT_RETURN_TO;

  // Must be a rooted path, and the second character must not turn it into an
  // authority reference.
  if (!candidate.startsWith("/")) return DEFAULT_RETURN_TO;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return DEFAULT_RETURN_TO;

  // Control characters — a newline or NUL can smuggle a scheme past a naive
  // check, or split a header further downstream.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return DEFAULT_RETURN_TO;

  // Never bounce back into the auth API — those are endpoints, not pages.
  if (candidate.startsWith("/api/")) return DEFAULT_RETURN_TO;

  return candidate;
}
