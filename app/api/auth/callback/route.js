import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  appUrl,
  unseal,
  equal,
  cookieOptions,
} from "../../../../lib/security.mjs";
import { setSession } from "../../../../lib/auth.mjs";
export async function GET(request) {
  const origin = appUrl(),
    jar = await cookies(),
    pending = unseal(jar.get("nslabs_oauth")?.value, "oauth"),
    p = new URL(request.url).searchParams;
  jar.delete("nslabs_oauth");
  if (
    !pending ||
    !equal(p.get("state"), pending.state) ||
    !p.get("code") ||
    p.get("error")
  )
    return NextResponse.redirect(origin + "/?auth=cancelled");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: p.get("code"),
        redirect_uri: origin + "/api/auth/callback",
        grant_type: "authorization_code",
        code_verifier: pending.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (
      !response.ok ||
      !data.access_token ||
      !data.scope
        ?.split(" ")
        .includes("https://www.googleapis.com/auth/spreadsheets")
    )
      throw new Error("Missing authorization");
    const identity = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${data.access_token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    const user = await identity.json();
    if (!identity.ok || !user.email || !user.email_verified)
      throw new Error("No verified identity");
    const allowed = (process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(user.email.toLowerCase()))
      return NextResponse.redirect(origin + "/?auth=denied");
    await setSession({
      email: user.email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expires: Date.now() + data.expires_in * 1000,
    });
    return NextResponse.redirect(origin + "/?auth=connected");
  } catch {
    return NextResponse.redirect(origin + "/?auth=failed");
  }
}
