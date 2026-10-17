import { session } from "../../../lib/auth.mjs";
import { missingSettings } from "../../../lib/security.mjs";
import { json } from "../../../lib/http.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await session();
  return json({
    configured: missingSettings().length === 0,
    missing: missingSettings(),
    connected: !!user,
    email: user?.email || null,
  });
}
