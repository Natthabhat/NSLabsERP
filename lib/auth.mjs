import { cookies } from "next/headers";
import { AppError, unseal, seal, cookieOptions } from "./security.mjs";
export const SESSION_COOKIE = "nslabs_session";
export async function session() {
  return unseal((await cookies()).get(SESSION_COOKIE)?.value, "session");
}
export async function setSession(value) {
  (await cookies()).set(
    SESSION_COOKIE,
    seal(value, "session", 7 * 86400),
    cookieOptions(7 * 86400),
  );
}
export async function token() {
  let user = await session();
  if (!user)
    throw new AppError("Sign in with Google to open this workbook.", 401);
  if (user.expires > Date.now() + 60000) return user.accessToken;
  if (!user.refreshToken)
    throw new AppError("Your Google session expired. Sign in again.", 401);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: user.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token)
    throw new AppError(
      "Google authorization expired or was revoked. Sign in again.",
      401,
    );
  user = {
    ...user,
    accessToken: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  await setSession(user);
  return user.accessToken;
}
