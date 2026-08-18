/** What a session mutation reports back. Never a token, never a backend body. */
export type SessionActionState = {
  readonly error?: string;
  readonly done?: string;
};

export const EMPTY_SESSION_STATE: SessionActionState = {};
