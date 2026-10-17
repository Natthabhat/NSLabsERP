import { cookies } from "next/headers";
import { checkOrigin } from "../../../../lib/security.mjs";
import { SESSION_COOKIE } from "../../../../lib/auth.mjs";
import { json, failure } from "../../../../lib/http.mjs";
export async function POST(request) {
  try {
    checkOrigin(request);
    (await cookies()).delete(SESSION_COOKIE);
    return json({ signedOut: true });
  } catch (e) {
    return failure(e);
  }
}
