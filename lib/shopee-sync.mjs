import { AppError } from './security.mjs';

export async function triggerShopeeSync({ env = process.env, fetcher = fetch } = {}) {
  const endpoint = env.SHOPEE_SYNC_WEBHOOK_URL, secret = env.SHOPEE_SYNC_KEY;
  let url;
  try { url = new URL(endpoint); } catch { throw new AppError('Order refresh is not configured. Open the automation or contact your administrator.', 503); }
  const allowedHost = (url.protocol === 'https:' && url.host === 'n8n.natthabhat.com') || (url.protocol === 'http:' && url.host === 'n8n:5678');
  if (!allowedHost || !url.pathname.startsWith('/webhook/nslabs-shopee-refresh-') || url.username || url.password || url.search || url.hash || typeof secret !== 'string' || secret.length < 32) {
    throw new AppError('Order refresh is not configured correctly. Contact your administrator.', 503);
  }
  const requestedAt = new Date().toISOString();
  let response;
  try {
    response = await fetcher(url.href, { method: 'POST', headers: { 'X-ERP-Sync-Key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'erp-refresh' }), redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store' });
  } catch { throw new AppError('Could not confirm the refresh request. Check the automation before trying again.', 502); }
  if (!response.ok) throw new AppError('The automation did not accept the refresh request. Check the collector workflow.', 502);
  // Never return the webhook URL, credential, or n8n response body to the browser.
  await response.body?.cancel();
  return { accepted: true, requestedAt };
}
