import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function appUrl() {
  const u = new URL(process.env.APP_URL || "http://localhost:3000");
  if (u.pathname !== "/" || u.search || u.hash)
    throw new AppError("APP_URL must be a plain origin.", 503);
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))
  )
    throw new AppError("Use HTTPS outside localhost.", 503);
  return u.origin;
}
function key() {
  if ((process.env.SESSION_SECRET || "").length < 32)
    throw new AppError("Set a SESSION_SECRET of at least 32 characters.", 503);
  return createHash("sha256").update(process.env.SESSION_SECRET).digest();
}
export function seal(value, purpose, seconds) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({ value, expires: Date.now() + seconds * 1000 }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function unseal(value, purpose) {
  try {
    const b = Buffer.from(value || "", "base64url");
    if (b.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(b.subarray(12, 28));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(b.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
    return payload.expires > Date.now() ? payload.value : null;
  } catch {
    return null;
  }
}
export function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function checkOrigin(request) {
  if (request.headers.get("origin") !== appUrl())
    throw new AppError("Request origin does not match APP_URL.", 403);
}
export function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}
export function cookieOptions(seconds) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https:"),
    path: "/",
    maxAge: seconds,
  };
}
export function missingSettings() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"].filter(
    (k) =>
      !process.env[k] || (k === "SESSION_SECRET" && process.env[k].length < 32),
  );
}
