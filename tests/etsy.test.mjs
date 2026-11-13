import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { etsyRequest, etsyToken, validateEtsyCredentials, pkcePair, etsyAuthorizeUrl, etsyReader } from '../lib/etsy.mjs';
import { normalizeEtsyReceipt, etsyOrderStatus, addThb, resolveCurrentSkus } from '../lib/etsy-orders.mjs';
import { summarizeEtsy } from '../lib/etsy-dashboard.mjs';

process.env.APP_URL = 'https://erp.example.com';
const credentials = { keystring: 'abcdefghij1234567890', sharedSecret: 'secret123' };
const ok = body => ({ ok: true, status: 200, headers: new Map(), json: async () => body });

test('Etsy requests send keystring:secret, bearer token, and only allow listed reads', async () => {
  const seen = [];
  const fetcher = async (url, options) => { seen.push({ url, options }); return ok({ results: [] }); };
  await etsyRequest('/v3/application/shops/123/receipts', { query: { limit: 100, offset: 0, skip: undefined }, accessToken: '42.token' }, credentials, { fetcher });
  const url = new URL(seen[0].url);
  assert.equal(url.origin + url.pathname, 'https://api.etsy.com/v3/application/shops/123/receipts');
  assert.equal(url.searchParams.get('limit'), '100'); assert.equal(url.searchParams.has('skip'), false);
  assert.equal(seen[0].options.headers['x-api-key'], 'abcdefghij1234567890:secret123');
  assert.equal(seen[0].options.headers.Authorization, 'Bearer 42.token');
  assert.equal(seen[0].options.method, 'GET'); assert.equal(seen[0].options.redirect, 'error');
  await etsyRequest('/v3/public/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: 'r' } }, credentials, { fetcher });
  assert.equal(seen[1].options.method, 'POST'); assert.match(seen[1].options.body, /grant_type=refresh_token/);
  await assert.rejects(etsyRequest('/v3/application/listings/1/images', {}, credentials, { fetcher }), /Unsupported/);
  await assert.rejects(etsyRequest('/v3/application/shops/../users/me', {}, credentials, { fetcher }), /Unsupported/);
  assert.equal(seen.length, 2);
});

test('Etsy errors do not leak response bodies and 429 is retried after retry-after', async () => {
  const leak = async () => ({ ok: false, status: 400, headers: new Map(), json: async () => ({ error: 'invalid_grant', error_description: 'private-token-value' }) });
  await assert.rejects(etsyRequest('/v3/application/users/me', {}, credentials, { fetcher: leak }), e => e.message.includes('invalid_grant') && !e.message.includes('private-token-value'));
  let calls = 0;
  const limited = async () => (++calls === 1 ? { ok: false, status: 429, headers: { get: () => '0' }, json: async () => ({}) } : ok({ results: [1] }));
  const read = etsyReader({ accessToken: '1.t', credentials }, { fetcher: limited, pause: 0 });
  assert.deepEqual(await read('/v3/application/shops/1/receipts', {}), { results: [1] }); assert.equal(calls, 2);
});

test('PKCE uses S256 and the authorize URL asks only for read scopes', () => {
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  const url = etsyAuthorizeUrl({ keystring: credentials.keystring, state: 'st', challenge });
  assert.equal(url.origin + url.pathname, 'https://www.etsy.com/oauth/connect');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://erp.example.com/api/etsy/callback');
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['listings_r', 'shops_r', 'transactions_r']);
});

test('Etsy tokens and keys are validated', () => {
  const t = etsyToken({ access_token: '12345.abc', refresh_token: '12345.def', expires_in: 3600 }, 1000);
  assert.equal(t.expiresAt, 3601000); assert.equal(t.userId, '12345'); assert.equal(t.refreshExpiresAt, 1000 + 90 * 86400000);
  for (const bad of [{ access_token: 'abc', refresh_token: 'r', expires_in: 1 }, { access_token: '1.a', expires_in: 1 }, { access_token: '1.a', refresh_token: 'r', expires_in: 0 }]) assert.throws(() => etsyToken(bad));
  assert.deepEqual(validateEtsyCredentials({ keystring: ' abcdefghij1234567890 ', sharedSecret: ' secret123 ' }), credentials);
  assert.throws(() => validateEtsyCredentials({ keystring: 'https://evil', sharedSecret: 'x' }));
});

const receipt = (over = {}) => ({
  receipt_id: 3456, status: 'paid', is_paid: true, is_shipped: false, created_timestamp: 1794500000, updated_timestamp: 1794500100,
  name: 'Buyer Name', first_line: '1 Private Road', buyer_email: 'buyer@example.com', message_from_buyer: 'private', formatted_address: 'secret',
  country_iso: 'US', grandtotal: { amount: 4599, divisor: 100, currency_code: 'USD' }, total_shipping_cost: { amount: 800, divisor: 100, currency_code: 'USD' },
  shipments: [{ carrier_name: 'Thailand Post', tracking_code: 'EE123' }],
  transactions: [{ transaction_id: 9, title: 'USS Enterprise-E Model', sku: 'ST006', quantity: 2, price: { amount: 1900, divisor: 100, currency_code: 'USD' }, listing_id: 77, product_id: 501, variations: [{ formatted_name: 'Scale', formatted_value: '1:1400' }, { formatted_name: 'Personalization', formatted_value: 'Private plaque text' }] }],
  ...over,
});

test('Etsy receipts keep operational data only, with no buyer identity or address', () => {
  const o = normalizeEtsyReceipt(receipt());
  assert.equal(o.orderId, '3456'); assert.equal(o.currency, 'USD'); assert.equal(o.orderTotalCents, 4599); assert.equal(o.shippingCents, 800);
  assert.equal(o.createdAt, '2026-11-12T16:13:20.000Z'); assert.deepEqual(o.carriers, ['Thailand Post']);
  assert.deepEqual(o.items, [{ lineKey: '9', product: 'USS Enterprise-E Model', sku: 'ST006', variation: 'Scale: 1:1400', quantity: 2, unitPriceCents: 1900, listingId: '77', productId: '501' }]);
  const stored = JSON.stringify(o);
  for (const secret of ['Buyer Name', 'Private Road', 'buyer@example.com', 'private', 'secret', 'EE123', 'Private plaque text']) assert.equal(stored.includes(secret), false, secret);
  assert.throws(() => normalizeEtsyReceipt({ receipt_id: 'x' }));
});

test('Etsy status: paid -> To ship, shipped -> Shipped, delivered -> Complete; cancelled, refunded and unpaid are hidden', () => {
  const s = over => etsyOrderStatus({ ...normalizeEtsyReceipt(receipt(over)), ...(over.delivered ? { delivered: true } : {}) });
  assert.equal(s({}), 'To ship');
  assert.equal(s({ status: 'completed', is_shipped: true }), 'Shipped');
  assert.equal(s({ status: 'completed', is_shipped: true, delivered: true }), 'Complete');
  assert.equal(s({ status: 'partially refunded', is_shipped: true }), 'Shipped');
  for (const status of ['canceled', 'fully refunded', 'open', 'payment processing']) assert.equal(s({ status }), null, status);
  assert.equal(s({ is_paid: false }), null);
});

test('Etsy amounts get a THB equivalent from the daily rate, cached per currency and day', async () => {
  let calls = 0;
  const fetcher = async url => { calls++; assert.match(url, /frankfurter\.app\/2026-11-12\?from=USD&to=THB/); return ok({ rates: { THB: 33.5 } }); };
  const orders = await addThb([normalizeEtsyReceipt(receipt()), normalizeEtsyReceipt(receipt({ receipt_id: 3457 }))], {}, fetcher);
  assert.equal(calls, 1); assert.equal(orders[0].thbTotalCents, Math.round(4599 * 33.5)); assert.equal(orders[0].fxDate, '2026-11-12');
  const failed = await addThb([normalizeEtsyReceipt(receipt())], {}, async () => { throw Error('offline'); });
  assert.equal(failed[0].thbTotalCents, null);
});

test('Etsy dashboard totals use THB equivalents and report the shop currency', () => {
  const o = { ...normalizeEtsyReceipt(receipt()), thbTotalCents: 154067 };
  const r = summarizeEtsy({ orders: [{ ...o, status: 'To ship' }, { ...o, orderId: '2', status: null }], checkedAt: '2026-11-13T00:00:00Z' }, new Date('2026-11-13T05:00:00Z'));
  assert.equal(r.orderCount, 1); assert.equal(r.paymentsCents, 154067); assert.equal(r.monthPaymentsCents, 154067); assert.equal(r.currency, 'USD'); assert.equal(r.overseasOrders, 0);
});

test('past orders use the listing\'s current SKU: by product ID, then variation, then the only product', async () => {
  const line = over => normalizeEtsyReceipt(receipt({ transactions: [{ transaction_id: 1, title: 'A', quantity: 1, listing_id: 88, product_id: 900, sku: '', ...over }] }));
  const inventory = { products: [
    { product_id: 900, sku: 'ST002' },
    { product_id: 35743630571, sku: 'ST012S', property_values: [{ values: ['14 Inch (1:1100)'] }] },
    { product_id: 35743630569, sku: 'ST012M', property_values: [{ values: ['17 Inch (1:900)'] }] },
  ] };
  const orders = [
    line({}),                                                                                   // empty SKU, same product ID
    line({ transaction_id: 2, product_id: 26207619635, sku: 'ST008S', variations: [{ formatted_name: 'Size', formatted_value: '14 Inch (1:1100)' }] }),
    line({ transaction_id: 3, product_id: 26207619647, sku: 'ST008M', variations: [{ formatted_name: 'Size', formatted_value: '17 Inch (1:900)' }] }),
    line({ transaction_id: 4, product_id: 1, sku: 'KEEP', variations: [{ formatted_name: 'Size', formatted_value: '20 Inch' }] }), // no match: keep
  ];
  const reads = [];
  await resolveCurrentSkus(orders, async path => { reads.push(path); return inventory; });
  assert.deepEqual(orders.map(o => o.items[0].sku), ['ST002', 'ST012S', 'ST012M', 'KEEP']);
  assert.deepEqual(orders.map(o => o.items[0].etsySku), [undefined, 'ST008S', 'ST008M', undefined]);
  assert.deepEqual(reads, ['/v3/application/listings/88/inventory']);
  const typo = [line({ listing_id: 89, product_id: 26570524696, sku: 'ST00S' })];
  await resolveCurrentSkus(typo, async () => ({ products: [{ product_id: 35743618891, sku: 'ST001S' }] }));
  assert.equal(typo[0].items[0].sku, 'ST001S'); assert.equal(typo[0].items[0].etsySku, 'ST00S');
  const offline = [line({ listing_id: 90, sku: 'ST006' })];
  await resolveCurrentSkus(offline, async () => { throw Error('down'); });
  assert.equal(offline[0].items[0].sku, 'ST006');
});
