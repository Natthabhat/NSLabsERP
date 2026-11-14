import { createHash, randomBytes } from 'node:crypto';
import { database } from './database.mjs';
import { AppError, seal, unseal, appUrl } from './security.mjs';

// Etsy Open API v3 for the shop owner's own Seller App (OAuth 2.0 with mandatory PKCE).
export const ETSY_SCOPES = ['transactions_r', 'listings_r', 'shops_r'];
export const etsyCallback = () => `${appUrl()}/api/etsy/callback`;
const API = 'https://api.etsy.com';
const READS = [/^\/v3\/application\/users\/me$/, /^\/v3\/application\/shops\/\d{1,20}$/, /^\/v3\/application\/shops\/\d{1,20}\/receipts$/, /^\/v3\/application\/listings\/\d{1,20}\/inventory$/, /^\/v3\/application\/shops\/\d{1,20}\/receipts\/\d{1,20}\/payments$/];
const REFRESH_LIFETIME = 90 * 86400 * 1000; // Etsy refresh tokens are valid for 90 days.

export function validateEtsyCredentials(input) {
  const keystring = typeof input?.keystring === 'string' ? input.keystring.trim() : '';
  const secret = typeof input?.sharedSecret === 'string' ? input.sharedSecret.trim() : '';
  if (!/^[A-Za-z0-9]{10,64}$/.test(keystring) || !/^[A-Za-z0-9]{6,128}$/.test(secret)) throw new AppError('Enter the Keystring and Shared secret from your Etsy app.', 400);
  return { keystring, sharedSecret: secret };
}
export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
export function etsyAuthorizeUrl({ keystring, state, challenge }) {
  const url = new URL('https://www.etsy.com/oauth/connect');
  url.search = new URLSearchParams({ response_type: 'code', redirect_uri: etsyCallback(), scope: ETSY_SCOPES.join(' '), client_id: keystring, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return url;
}
export function etsyToken(data, now = Date.now()) {
  if (typeof data?.access_token !== 'string' || !/^\d+\./.test(data.access_token) || typeof data.refresh_token !== 'string' || !data.refresh_token || !(Number(data.expires_in) > 0)) throw new AppError('Etsy did not return a valid authorization. Connect your shop again.', 400);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: now + Number(data.expires_in) * 1000, refreshExpiresAt: now + REFRESH_LIFETIME, userId: data.access_token.split('.')[0] };
}

// Every Etsy request sends "keystring:shared_secret" as x-api-key. Only listed reads and the token grant are allowed.
export async function etsyRequest(path, { query, form, accessToken } = {}, credentials, { fetcher = fetch } = {}) {
  const token = path === '/v3/public/oauth/token';
  if (!token && !READS.some(rule => rule.test(path))) throw new AppError('Unsupported Etsy request.', 400);
  const url = new URL(API + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const headers = { 'x-api-key': `${credentials.keystring}:${credentials.sharedSecret}`, Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (token) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  let response, data;
  try {
    response = await fetcher(url.href, { method: token ? 'POST' : 'GET', headers, ...(token ? { body: new URLSearchParams(form).toString() } : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    data = await response.json().catch(() => ({}));
  } catch { throw new AppError('Etsy could not be reached. Please try again.', 502); }
  if (response.status === 429) { const e = new AppError('Etsy rate limit reached. Try again shortly.', 429); e.retryAfter = Number(response.headers?.get?.('retry-after')) || 2; throw e; }
  if (!response.ok) {
    const code = typeof data?.error === 'string' && /^[a-z_]{1,60}$/.test(data.error) ? ` (${data.error})` : '';
    throw new AppError(`Etsy rejected the request${code}. Check the app keys and shop authorization.`, response.status === 401 || response.status === 403 ? 409 : 400);
  }
  return data;
}
export function etsyReader(access, { fetcher, pause = 150 } = {}) {
  return async (path, query) => {
    for (let attempt = 0; ; attempt++) {
      await new Promise(r => setTimeout(r, pause));
      try { return await etsyRequest(path, { query, accessToken: access.accessToken }, access.credentials, { fetcher }); }
      catch (error) { if (error.status !== 429 || attempt >= 3) throw error; await new Promise(r => setTimeout(r, Math.min(30, error.retryAfter) * 1000)); }
    }
  };
}

export async function etsySettings(pool = database()) {
  const row = (await pool.query('SELECT * FROM erp_web.etsy_connection WHERE id=true')).rows[0];
  if (!row) return null;
  const credentials = unseal(row.credentials, 'etsy-credentials');
  if (!credentials) throw new AppError('Save your Etsy app keys again.', 503);
  return { ...row, credentials, token: unseal(row.tokens, 'etsy-tokens') };
}
async function locked(work) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('etsy-connection',0))");
    const result = await work(client);
    await client.query('COMMIT'); return result;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function saveEtsyCredentials(input) {
  const credentials = validateEtsyCredentials(input);
  // New keys replace the connection; the shop must be authorized again.
  await locked(client => client.query(`INSERT INTO erp_web.etsy_connection(id,keystring,credentials) VALUES(true,$1,$2) ON CONFLICT(id) DO UPDATE SET keystring=excluded.keystring,credentials=excluded.credentials,tokens=NULL,user_id=NULL,shop_id=NULL,shop_name=NULL,currency=NULL,connected_at=NULL,checked_at=NULL,updated_at=now()`, [credentials.keystring, seal(credentials, 'etsy-credentials', 3650 * 86400)]));
}
export async function completeEtsyAuthorization({ code, verifier, keystring }, { fetcher } = {}) {
  await locked(async client => {
    const settings = await etsySettings(client);
    if (!settings || settings.keystring !== keystring) throw new AppError('The Etsy app changed. Start authorization again.', 409);
    const token = etsyToken(await etsyRequest('/v3/public/oauth/token', { form: { grant_type: 'authorization_code', client_id: keystring, redirect_uri: etsyCallback(), code, code_verifier: verifier } }, settings.credentials, { fetcher }));
    const me = await etsyRequest('/v3/application/users/me', { accessToken: token.accessToken }, settings.credentials, { fetcher });
    if (!me?.shop_id) throw new AppError('This Etsy account has no shop. Sign in with your seller account.', 409);
    const shop = await etsyRequest(`/v3/application/shops/${Number(me.shop_id)}`, {}, settings.credentials, { fetcher });
    await client.query('UPDATE erp_web.etsy_connection SET tokens=$1,user_id=$2,shop_id=$3,shop_name=$4,currency=$5,connected_at=now(),checked_at=NULL,updated_at=now() WHERE id=true',
      [seal(token, 'etsy-tokens', 365 * 86400), String(me.user_id), String(me.shop_id), String(shop?.shop_name || '').slice(0, 100), String(shop?.currency_code || '').slice(0, 3) || null]);
  });
}
export async function etsyAccess({ fetcher } = {}) {
  return locked(async client => {
    const settings = await etsySettings(client); let token = settings?.token;
    if (!token || !settings.shop_id) throw new AppError('Connect your Etsy shop first.', 409);
    if (token.expiresAt < Date.now() + 300000) {
      if (token.refreshExpiresAt <= Date.now()) throw new AppError('Etsy authorization expired. Connect your shop again.', 409);
      token = etsyToken(await etsyRequest('/v3/public/oauth/token', { form: { grant_type: 'refresh_token', client_id: settings.keystring, refresh_token: token.refreshToken } }, settings.credentials, { fetcher }));
      await client.query('UPDATE erp_web.etsy_connection SET tokens=$1,updated_at=now() WHERE id=true', [seal(token, 'etsy-tokens', 365 * 86400)]);
    }
    return { shopId: settings.shop_id, currency: settings.currency, credentials: settings.credentials, accessToken: token.accessToken };
  });
}
