import { createHash, createHmac } from 'node:crypto';
import { database } from './database.mjs';
import { AppError, seal, unseal, appUrl } from './security.mjs';

// eBay Sell APIs for the shop owner's own production keyset (OAuth authorization code grant with a RuName).
export const EBAY_SCOPES = ['sell.fulfillment.readonly', 'sell.finances', 'commerce.identity.readonly'].map(s => `https://api.ebay.com/oauth/api_scope/${s}`);
export const ebayCallback = () => `${appUrl()}/api/ebay/callback`;
export const ebayDeletionEndpoint = () => `${appUrl()}/api/ebay/account-deletion`;
const TOKEN = 'https://api.ebay.com/identity/v1/oauth2/token';
const READS = [
  /^https:\/\/apiz\.ebay\.com\/commerce\/identity\/v1\/user\/$/,
  /^https:\/\/api\.ebay\.com\/sell\/fulfillment\/v1\/order$/,
  /^https:\/\/apiz\.ebay\.com\/sell\/finances\/v1\/payout$/,
];

// Token for eBay's Marketplace Account Deletion challenge. Derived from the session secret, so the endpoint
// works before any keys are saved (eBay asks for it before it activates a production keyset).
export function ebayVerificationToken() {
  if ((process.env.SESSION_SECRET || '').length < 32) throw new AppError('Set a SESSION_SECRET of at least 32 characters.', 503);
  return createHmac('sha256', process.env.SESSION_SECRET).update('ebay-marketplace-account-deletion').digest('base64url');
}
export function ebayChallengeResponse(challengeCode) {
  return createHash('sha256').update(challengeCode + ebayVerificationToken() + ebayDeletionEndpoint()).digest('hex');
}

export function validateEbayCredentials(input) {
  const clientId = typeof input?.clientId === 'string' ? input.clientId.trim() : '';
  const clientSecret = typeof input?.clientSecret === 'string' ? input.clientSecret.trim() : '';
  const ruName = typeof input?.ruName === 'string' ? input.ruName.trim() : '';
  if (!/^[A-Za-z0-9._-]{5,120}-PRD-[A-Za-z0-9._-]{4,120}$/.test(clientId)) throw new AppError('Enter the production App ID (Client ID) from your eBay keyset. Sandbox keys are not supported.', 400);
  if (!/^PRD-[A-Za-z0-9._-]{8,200}$/.test(clientSecret)) throw new AppError('Enter the production Cert ID (Client Secret) from your eBay keyset.', 400);
  if (!/^[A-Za-z0-9._-]{5,200}$/.test(ruName)) throw new AppError('Enter the RuName (eBay Redirect URL name) from your keyset.', 400);
  return { clientId, clientSecret, ruName };
}
export function ebayAuthorizeUrl({ clientId, ruName, state }) {
  const url = new URL('https://auth.ebay.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: ruName, response_type: 'code', scope: EBAY_SCOPES.join(' '), state }).toString();
  return url;
}
export function ebayToken(data, previous = null, now = Date.now()) {
  if (typeof data?.access_token !== 'string' || !data.access_token || !(Number(data.expires_in) > 0)) throw new AppError('eBay did not return a valid authorization. Connect your account again.', 400);
  // Refresh responses carry no new refresh token; the original one stays valid until it expires.
  const refreshToken = typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : previous?.refreshToken;
  const refreshExpiresAt = data.refresh_token ? now + (Number(data.refresh_token_expires_in) > 0 ? Number(data.refresh_token_expires_in) * 1000 : 0) : previous?.refreshExpiresAt;
  if (!refreshToken || !(refreshExpiresAt > now)) throw new AppError('eBay did not return a refresh token. Connect your account again.', 400);
  return { accessToken: data.access_token, refreshToken, expiresAt: now + Number(data.expires_in) * 1000, refreshExpiresAt };
}

export async function ebayTokenRequest(form, credentials, { fetcher = fetch } = {}) {
  let response, data;
  try {
    response = await fetcher(TOKEN, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    data = await response.json().catch(() => ({}));
  } catch { throw new AppError('eBay could not be reached. Please try again.', 502); }
  if (!response.ok) {
    const code = typeof data?.error === 'string' && /^[a-z_]{1,60}$/.test(data.error) ? ` (${data.error})` : '';
    throw new AppError(`eBay rejected the authorization${code}. Check the App ID, Cert ID and RuName.`, 400);
  }
  return data;
}
// Only listed reads are allowed. Response bodies are never echoed in errors.
export async function ebayRequest(url, { query, accessToken, marketplace } = {}, { fetcher = fetch } = {}) {
  const target = new URL(url);
  if (!READS.some(rule => rule.test(target.origin + target.pathname))) throw new AppError('Unsupported eBay request.', 400);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) target.searchParams.set(k, String(v));
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  if (marketplace) headers['X-EBAY-C-MARKETPLACE-ID'] = marketplace;
  let response, data;
  try {
    response = await fetcher(target.href, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
    data = await response.json().catch(() => ({}));
  } catch { throw new AppError('eBay could not be reached. Please try again.', 502); }
  if (response.status === 429) { const e = new AppError('eBay call limit reached. Try again later.', 429); e.retryAfter = Number(response.headers?.get?.('retry-after')) || 5; throw e; }
  if (!response.ok) {
    const id = Number.isInteger(data?.errors?.[0]?.errorId) ? ` (error ${data.errors[0].errorId})` : '';
    throw new AppError(`eBay rejected the request${id}. Check the keyset and account authorization.`, response.status === 401 || response.status === 403 ? 409 : 400);
  }
  return data;
}
export function ebayReader(access, { fetcher, pause = 200 } = {}) {
  return async (url, query) => {
    for (let attempt = 0; ; attempt++) {
      await new Promise(r => setTimeout(r, pause));
      try { return await ebayRequest(url, { query, accessToken: access.accessToken, marketplace: access.marketplace }, { fetcher }); }
      catch (error) { if (error.status !== 429 || attempt >= 3) throw error; await new Promise(r => setTimeout(r, Math.min(30, error.retryAfter) * 1000)); }
    }
  };
}

export async function ebaySettings(pool = database()) {
  const row = (await pool.query('SELECT * FROM erp_web.ebay_connection WHERE id=true')).rows[0];
  if (!row) return null;
  const credentials = unseal(row.credentials, 'ebay-credentials');
  if (!credentials) throw new AppError('Save your eBay keys again.', 503);
  return { ...row, credentials, token: unseal(row.tokens, 'ebay-tokens') };
}
async function locked(work) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ebay-connection',0))");
    const result = await work(client);
    await client.query('COMMIT'); return result;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function saveEbayCredentials(input) {
  const credentials = validateEbayCredentials(input);
  await locked(client => client.query(`INSERT INTO erp_web.ebay_connection(id,client_id,ru_name,credentials) VALUES(true,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,ru_name=excluded.ru_name,credentials=excluded.credentials,tokens=NULL,username=NULL,marketplace=NULL,connected_at=NULL,checked_at=NULL,updated_at=now()`, [credentials.clientId, credentials.ruName, seal(credentials, 'ebay-credentials', 3650 * 86400)]));
}
export async function completeEbayAuthorization({ code, clientId }, { fetcher } = {}) {
  await locked(async client => {
    const settings = await ebaySettings(client);
    if (!settings || settings.client_id !== clientId) throw new AppError('The eBay keyset changed. Start authorization again.', 409);
    const token = ebayToken(await ebayTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: settings.credentials.ruName }, settings.credentials, { fetcher }));
    const user = await ebayRequest('https://apiz.ebay.com/commerce/identity/v1/user/', { accessToken: token.accessToken }, { fetcher });
    if (typeof user?.username !== 'string' || !user.username) throw new AppError('eBay did not identify the account. Connect again.', 409);
    const marketplace = /^EBAY_[A-Z_]{2,10}$/.test(user.registrationMarketplaceId || '') ? user.registrationMarketplaceId : 'EBAY_US';
    await client.query('UPDATE erp_web.ebay_connection SET tokens=$1,username=$2,marketplace=$3,connected_at=now(),checked_at=NULL,updated_at=now() WHERE id=true', [seal(token, 'ebay-tokens', 600 * 86400), user.username.slice(0, 100), marketplace]);
  });
}
export async function ebayAccess({ fetcher } = {}) {
  return locked(async client => {
    const settings = await ebaySettings(client); let token = settings?.token;
    if (!token || !settings.username) throw new AppError('Connect your eBay account first.', 409);
    if (token.expiresAt < Date.now() + 300000) {
      if (!(token.refreshExpiresAt > Date.now())) throw new AppError('eBay authorization expired. Connect your account again.', 409);
      token = ebayToken(await ebayTokenRequest({ grant_type: 'refresh_token', refresh_token: token.refreshToken, scope: EBAY_SCOPES.join(' ') }, settings.credentials, { fetcher }), token);
      await client.query('UPDATE erp_web.ebay_connection SET tokens=$1,updated_at=now() WHERE id=true', [seal(token, 'ebay-tokens', 600 * 86400)]);
    }
    return { seller: settings.username, marketplace: settings.marketplace || 'EBAY_US', accessToken: token.accessToken };
  });
}
