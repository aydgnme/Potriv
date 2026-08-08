import { NextResponse } from "next/server";

import { UNAUTHENTICATED } from "@/modules/auth/model/session";
import { noStore } from "@/modules/auth/server/httpResponse";
import { resolveProductSession } from "@/modules/auth/server/productSession";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, for client components that need it.
 *
 * Returns identity and roles only. There is no field here that could hold a
 * token, so future product modules can consume the session without ever
 * learning that tokens exist.
 */
export async function GET() {
  const session = await resolveProductSession();
  return noStore(
    NextResponse.json(session.authenticated ? session : UNAUTHENTICATED),
  );
}
