import "server-only";

import type { AccountSession } from "../model/sessionList";
import {
  ACCOUNT_DATA_SOURCES,
  type AccountDataSources,
  type Loaded,
} from "./accountDataSources";

/**
 * Everything the Account screen loads: one request.
 *
 * Identity is **not** fetched here. The protected layout has already resolved
 * the session to render the shell at all, so asking `/auth/me` a second time
 * would buy nothing but a round trip — the route passes the user it already has.
 *
 * A failed session read therefore costs the sessions section and nothing else:
 * who you are is still on screen, because that answer never depended on this
 * call.
 */
export type AccountData = {
  readonly sessions: Loaded<readonly AccountSession[]>;
};

export async function loadAccount(
  sources: AccountDataSources = ACCOUNT_DATA_SOURCES,
): Promise<AccountData> {
  return { sessions: await sources.getSessions() };
}
