import test from 'node:test';
import assert from 'node:assert/strict';
import { triggerShopeeSync } from '../lib/shopee-sync.mjs';
const env = { SHOPEE_SYNC_WEBHOOK_URL: 'https://n8n.natthabhat.com/webhook/nslabs-shopee-refresh-test', SHOPEE_SYNC_KEY: 'test-key-'.repeat(8) };
test('ERP refresh calls the fixed n8n webhook with a server-side credential only', async () => {
  let request;
  const result = await triggerShopeeSync({ env, fetcher: async (url, options) => { request = { url, options }; return new Response(null, { status: 202 }); } });
  assert.equal(request.url, env.SHOPEE_SYNC_WEBHOOK_URL); assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['X-ERP-Sync-Key'], env.SHOPEE_SYNC_KEY); assert.equal(request.options.redirect, 'error');
  assert.equal(result.accepted, true); assert(Number.isFinite(Date.parse(result.requestedAt)));
  assert(!JSON.stringify(result).includes(env.SHOPEE_SYNC_KEY)); assert(!JSON.stringify(result).includes('https://'));
});
test('invalid destinations and missing credentials fail before any network call', async () => {
  for (const invalid of [{}, { ...env, SHOPEE_SYNC_KEY: '' }, { ...env, SHOPEE_SYNC_WEBHOOK_URL: 'http://n8n.natthabhat.com/webhook/nslabs-shopee-refresh-test' }, { ...env, SHOPEE_SYNC_WEBHOOK_URL: 'https://other.example/webhook/nslabs-shopee-refresh-test' }]) {
    await assert.rejects(triggerShopeeSync({ env: invalid, fetcher: () => { throw Error('Must not be called'); } }), /not configured/);
  }
});
test('ERP can use the approved private n8n network endpoint', async () => {
  const privateEnv = { ...env, SHOPEE_SYNC_WEBHOOK_URL: 'http://n8n:5678/webhook/nslabs-shopee-refresh-test' };
  const result = await triggerShopeeSync({ env: privateEnv, fetcher: async url => { assert.equal(url, privateEnv.SHOPEE_SYNC_WEBHOOK_URL); return new Response(null); } });
  assert.equal(result.accepted, true);
});
test('n8n failures never report a completed refresh or disclose credentials', async () => {
  await assert.rejects(triggerShopeeSync({ env, fetcher: async () => new Response('private detail', { status: 401 }) }), /did not accept/);
  await assert.rejects(triggerShopeeSync({ env, fetcher: async () => { throw Error(env.SHOPEE_SYNC_KEY); } }), error => !error.message.includes(env.SHOPEE_SYNC_KEY) && /Could not confirm/.test(error.message));
});
