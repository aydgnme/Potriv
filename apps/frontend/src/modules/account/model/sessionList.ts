/**
 * A session, exactly as `SessionResponse` provides it.
 *
 * Seven fields, and deliberately nothing derived from them. An IP address is not
 * a city, a user-agent string is not a device model, and `lastSeenAt` is not
 * "active now" — each of those would be a guess presented on a security screen,
 * which is the worst place to guess.
 *
 * `revokedAt` is here because the backend returns revoked rows:
 * `findByUserIdOrderByCreatedAtDesc` filters nothing, so a session that has
 * ended still appears and is shown as ended rather than silently dropped.
 */
export type AccountSession = {
  readonly sessionId: string;
  readonly createdAt: string | null;
  readonly lastSeenAt: string | null;
  /** Non-null once the session has ended. Such a row is read-only. */
  readonly revokedAt: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  /**
   * The backend's own answer to "is this the session reading the page?".
   *
   * Never inferred from cookies, tokens, IP or user agent — the browser has no
   * reliable way to know, and the backend already does.
   */
  readonly currentSession: boolean;
};

/** True when the row can still be acted on. A revoked session has already ended. */
export function isRevoked(session: AccountSession): boolean {
  return session.revokedAt !== null;
}

/**
 * Groups the list for presentation without redefining authority.
 *
 * Backend order is `createdAt DESC` and is preserved inside each group — this
 * splits the same list in two, it does not re-sort it. The current session is
 * separated because "which one am I?" is the first question this screen answers.
 */
export type GroupedSessions = {
  readonly current: readonly AccountSession[];
  readonly others: readonly AccountSession[];
};

export function groupSessions(sessions: readonly AccountSession[]): GroupedSessions {
  return {
    current: sessions.filter((session) => session.currentSession),
    others: sessions.filter((session) => !session.currentSession),
  };
}
