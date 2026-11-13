import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ebayRequest, ebayTokenRequest, ebayToken, validateEbayCredentials, ebayAuthorizeUrl, ebayReader, ebayChallengeResponse, ebayVerificationToken, EBAY_SCOPES } from '../lib/ebay.mjs';
import { normalizeEbayOrder, normalizeEbayPayout, ebayOrderStatus } from '../lib/ebay-orders.mjs';
import { summarizeEbay } from '../lib/ebay-dashboard.mjs';

process.env.APP_URL = 'https://erp.example.com';
process.env.SESSION_SECRET = 'x'.repeat(40);
const credentials = { clientId: 'Natthaba-NSLabsER-PRD-1a2b3c4d5-6e7f8a9b', clientSecret: 'PRD-1a2b3c4d5e6f-7a8b-9c0d', ruName: 'Natthabhat-Natthaba-NSLabs-abcdef' };
const ok = body => ({ ok: true, status: 200, headers: new Map(), json: async () => body });

test('eBay reads send the bearer token and marketplace header, and only listed endpoints are allowed', async () => {
  const seen = [];
  const fetcher = async (url, options) => { seen.push({ url, options }); return ok({ orders: [] }); };
  await ebayRequest('https://api.ebay.com/sell/fulfillment/v1/order', { query: { filter: 'creationdate:[2025-01-01T00:00:00.000Z..]', limit: 200 }, accessToken: 'v^1.1#tok', marketplace: 'EBAY_US' }, { fetcher });
  const url = new URL(seen[0].url);
  assert.equal(url.origin + url.pathname, 'https://api.ebay.com/sell/fulfillment/v1/order');
  assert.equal(url.searchParams.get('filter'), 'creationdate:[2025-01-01T00:00:00.000Z..]');
  assert.equal(seen[0].options.headers.Authorization, 'Bearer v^1.1#tok'); assert.equal(seen[0].options.headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_US');
  assert.equal(seen[0].options.method, 'GET'); assert.equal(seen[0].options.redirect, 'error');
  for (const bad of ['https://api.ebay.com/sell/fulfillment/v1/order/1/shipping_fulfillment', 'https://api.ebay.com/sell/inventory/v1/inventory_item', 'https://evil.example/sell/fulfillment/v1/order'])
    await assert.rejects(ebayRequest(bad, { accessToken: 't' }, { fetcher }), /Unsupported/);
  assert.equal(seen.length, 1);
});

test('eBay token requests use Basic client credentials and never echo error bodies', async () => {
  let seen;
  await ebayTokenRequest({ grant_type: 'authorization_code', code: 'c', redirect_uri: credentials.ruName }, credentials, { fetcher: async (url, o) => { seen = { url, o }; return ok({}); } });
  assert.equal(seen.url, 'https://api.ebay.com/identity/v1/oauth2/token');
  assert.equal(seen.o.headers.Authorization, 'Basic ' + Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64'));
  assert.match(seen.o.body, /redirect_uri=Natthabhat-Natthaba-NSLabs-abcdef/);
  const leak = async () => ({ ok: false, status: 400, headers: new Map(), json: async () => ({ error: 'invalid_grant', error_description: 'secret-detail' }) });
  await assert.rejects(ebayTokenRequest({}, credentials, { fetcher: leak }), e => e.message.includes('invalid_grant') && !e.message.includes('secret-detail'));
  await assert.rejects(ebayRequest('https://apiz.ebay.com/sell/finances/v1/payout', { accessToken: 't' }, { fetcher: async () => ({ ok: false, status: 403, headers: new Map(), json: async () => ({ errors: [{ errorId: 1100, longMessage: 'private-detail' }] }) }) }), e => e.message.includes('1100') && !e.message.includes('private-detail') && e.status === 409);
});

test('eBay 429 is retried after retry-after', async () => {
  let calls = 0;
  const fetcher = async () => (++calls === 1 ? { ok: false, status: 429, headers: { get: () => '0' }, json: async () => ({}) } : ok({ payouts: [] }));
  assert.deepEqual(await ebayReader({ accessToken: 't', marketplace: 'EBAY_US' }, { fetcher, pause: 0 })('https://apiz.ebay.com/sell/finances/v1/payout', {}), { payouts: [] });
  assert.equal(calls, 2);
});

test('authorization uses the RuName and read-only order, finance and identity scopes; tokens keep the refresh token', () => {
  const url = ebayAuthorizeUrl({ clientId: credentials.clientId, ruName: credentials.ruName, state: 'st' });
  assert.equal(url.origin + url.pathname, 'https://auth.ebay.com/oauth2/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), credentials.ruName); assert.equal(url.searchParams.get('state'), 'st');
  assert.deepEqual(url.searchParams.get('scope').split(' '), EBAY_SCOPES);
  const first = ebayToken({ access_token: 'a1', expires_in: 7200, refresh_token: 'r1', refresh_token_expires_in: 47304000 }, null, 1000);
  assert.equal(first.expiresAt, 7201000); assert.equal(first.refreshExpiresAt, 1000 + 47304000000);
  const refreshed = ebayToken({ access_token: 'a2', expires_in: 7200 }, first, 5000);
  assert.equal(refreshed.refreshToken, 'r1'); assert.equal(refreshed.refreshExpiresAt, first.refreshExpiresAt); assert.equal(refreshed.accessToken, 'a2');
  assert.throws(() => ebayToken({ access_token: 'a', expires_in: 7200 }, null));
  assert.deepEqual(validateEbayCredentials({ clientId: ` ${credentials.clientId} `, clientSecret: credentials.clientSecret, ruName: credentials.ruName }), credentials);
  assert.throws(() => validateEbayCredentials({ ...credentials, clientId: 'Natthaba-NSLabsER-SBX-1a2b3c4d5-6e7f8a9b' }), /Sandbox/);
});

test('account deletion challenge is sha256(challengeCode + verificationToken + endpoint)', () => {
  const token = ebayVerificationToken();
  assert.match(token, /^[A-Za-z0-9_-]{32,80}$/);
  assert.equal(ebayChallengeResponse('abc'), createHash('sha256').update('abc' + token + 'https://erp.example.com/api/ebay/account-deletion').digest('hex'));
});

const order = (over = {}) => ({
  orderId: '12-34567-89012', creationDate: '2026-11-01T10:00:00.000Z', lastModifiedDate: '2026-11-02T10:00:00.000Z',
  orderFulfillmentStatus: 'NOT_STARTED', orderPaymentStatus: 'PAID', cancelStatus: { cancelState: 'NONE_REQUESTED' },
  buyer: { username: 'private_buyer', buyerRegistrationAddress: { fullName: 'Private Name', email: 'buyer@example.com' } }, buyerCheckoutNotes: 'private note',
  pricingSummary: { total: { value: '89.50', currency: 'USD' } }, totalMarketplaceFee: { value: '11.20', currency: 'USD' },
  fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: 'Private Name', contactAddress: { addressLine1: '1 Private St', city: 'Austin', countryCode: 'US' }, primaryPhone: { phoneNumber: '5551234' } } } }],
  lineItems: [{ lineItemId: '1001', legacyItemId: '2002', sku: 'ST011M', title: 'USS Voyager Model', quantity: 2, lineItemCost: { value: '79.00', currency: 'USD' }, variationAspects: [{ name: 'Size', value: '17 Inch' }] }],
  ...over,
});

test('eBay orders keep operational data only, with no buyer identity, address, phone or notes', () => {
  const o = normalizeEbayOrder(order());
  assert.equal(o.orderId, '12-34567-89012'); assert.equal(o.currency, 'USD'); assert.equal(o.orderTotalCents, 8950); assert.equal(o.marketplaceFeeCents, 1120); assert.equal(o.country, 'US');
  assert.deepEqual(o.items, [{ lineKey: '1001', product: 'USS Voyager Model', sku: 'ST011M', variation: 'Size: 17 Inch', quantity: 2, unitPriceCents: 3950, lineSubtotalCents: 7900, listingId: '2002' }]);
  const stored = JSON.stringify(o);
  for (const secret of ['private_buyer', 'Private Name', 'buyer@example.com', 'private note', 'Private St', 'Austin', '5551234']) assert.equal(stored.includes(secret), false, secret);
  assert.throws(() => normalizeEbayOrder({ orderId: '../x' }));
});

test('eBay status: unshipped -> To ship, shipped -> Shipped, shipped 30+ days -> Complete; cancelled, refunded, unpaid hidden', () => {
  const now = Date.parse('2026-11-13T00:00:00Z');
  const s = over => ebayOrderStatus(normalizeEbayOrder(order(over)), now);
  assert.equal(s({}), 'To ship'); assert.equal(s({ orderFulfillmentStatus: 'IN_PROGRESS' }), 'To ship');
  assert.equal(s({ orderFulfillmentStatus: 'FULFILLED' }), 'Shipped');
  assert.equal(s({ orderFulfillmentStatus: 'FULFILLED', creationDate: '2026-10-01T00:00:00Z' }), 'Complete');
  assert.equal(s({ orderFulfillmentStatus: 'FULFILLED', orderPaymentStatus: 'PARTIALLY_REFUNDED' }), 'Shipped');
  assert.equal(s({ cancelStatus: { cancelState: 'CANCELED' } }), null);
  for (const p of ['FULLY_REFUNDED', 'FAILED', 'PENDING']) assert.equal(s({ orderPaymentStatus: p }), null, p);
});

test('eBay payouts keep amount, status and date without bank details', () => {
  const p = normalizeEbayPayout({ payoutId: '6000123', payoutStatus: 'SUCCEEDED', payoutDate: '2026-10-28T03:00:00.000Z', amount: { value: '230.45', currency: 'USD' }, totalFee: { value: '0.00', currency: 'USD' }, transactionCount: 5, payoutInstrument: { instrumentType: 'BANK', nickname: 'My private bank', accountLastFourDigits: '1234' } });
  assert.deepEqual(p, { payoutId: '6000123', status: 'SUCCEEDED', payoutDate: '2026-10-28T03:00:00.000Z', currency: 'USD', amountCents: 23045, feeCents: 0, transactionCount: 5, instrument: 'BANK' });
  assert.throws(() => normalizeEbayPayout({ payoutId: 'a b' }));
});

test('eBay dashboard totals use THB equivalents', () => {
  const o = { ...normalizeEbayOrder(order()), thbTotalCents: 300000, status: 'To ship' };
  const r = summarizeEbay({ orders: [o, { ...o, orderId: '2', status: null }], checkedAt: '2026-11-13T00:00:00Z' }, new Date('2026-11-13T05:00:00Z'));
  assert.equal(r.orderCount, 1); assert.equal(r.paymentsCents, 300000); assert.equal(r.monthPaymentsCents, 300000); assert.equal(r.currency, 'USD');
});
