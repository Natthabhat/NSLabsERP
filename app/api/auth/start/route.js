import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import {
  appUrl,
  missingSettings,
  seal,
  cookieOptions,
} from "../../../../lib/security.mjs";
export async function GET() {
  const origin = appUrl();
  if (missingSettings().length)
    return NextResponse.redirect(origin + "/?auth=setup");
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: origin + "/api/auth/callback",
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/spreadsheets",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(target);
  response.cookies.set(
    "nslabs_oauth",
    seal({ state, verifier }, "oauth", 600),
    cookieOptions(600),
  );
  return response;
}
