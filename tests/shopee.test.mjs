import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateShopeeSnapshot, readShopeeSnapshot } from '../lib/shopee.mjs';

function report() { return { schemaVersion: 1, source: 'shopee-seller-centre', scope: 'to_ship', collectedAt: '2026-10-25T12:26:04Z', shop: 'test', orders: [{ orderId: 'TEST-001', status: 'To Ship', currency: 'THB', createdAt: '2026-10-25', orderTotalCents: 12345, buyerName: 'PRIVATE BUYER', address: 'PRIVATE ADDRESS', items: [{ lineKey: 'line-1', product: 'Test product', sku: 'TEST', quantity: 2, unitPriceCents: 5000, lineSubtotalCents: 10000 }] }] }; }

test('Shopee snapshots expose whitelisted operational data and count orders once', () => {
  const result = validateShopeeSnapshot(report());
  assert.equal(result.orderCount, 1); assert.equal(result.itemCount, 1); assert.equal(result.orders[0].orderTotalCents, 12345);
  assert.equal(result.orders[0].items[0].lineSubtotalCents, 10000);
  assert(!JSON.stringify(result).includes('PRIVATE'));
});
test('Shopee snapshots reject unsupported data, duplicate IDs, and inconsistent money', () => {
  const source = report();
  assert.throws(() => validateShopeeSnapshot({ ...source, scope: 'all' }), /not supported/);
  assert.throws(() => validateShopeeSnapshot({ ...source, orders: [...source.orders, ...source.orders] }), /duplicate order/);
  source.orders[0].items[0].lineSubtotalCents = 1;
  assert.throws(() => validateShopeeSnapshot(source), /do not match/);
  source.orders[0].items[0].unitPriceCents = -1;
  assert.throws(() => validateShopeeSnapshot(source), /invalid amount/);
});
test('read-only Shopee integration distinguishes missing, empty, and malformed reports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nslabs-shopee-test-'));
  try {
    assert.equal((await readShopeeSnapshot(directory)).available, false);
    await writeFile(join(directory, 'latest-orders.json'), JSON.stringify({ ...report(), orders: [] }));
    const empty = await readShopeeSnapshot(directory); assert.equal(empty.available, true); assert.deepEqual(empty.snapshot.orders, []);
    await writeFile(join(directory, 'latest-orders.json'), '{bad json');
    await assert.rejects(readShopeeSnapshot(directory), /could not be read/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('overseas SIP orders keep their region and currency, with a THB equivalent', () => {
  const data = report();
  data.orders.push({ orderId: 'MY-001', region: 'my', status: 'To ship', currency: 'MYR', createdAt: '2026-11-10 21:24', orderTotalCents: 48183, thbTotalCents: 397486, fxRateToThb: 8.2495, fxDate: '2026-11-10', items: [{ lineKey: 'my1', product: 'Model', sku: 'ST006', quantity: 1, unitPriceCents: 23434, lineSubtotalCents: 23434 }] });
  data.regions = [{ region: 'th', orderCount: 1, ok: true }, { region: 'my', orderCount: 1, ok: true }, { region: 'xx', ok: true }];
  const result = validateShopeeSnapshot(data);
  const th = result.orders.find(o => o.orderId === 'TEST-001'), my = result.orders.find(o => o.orderId === 'MY-001');
  assert.equal(th.region, 'th'); assert.equal(th.currency, 'THB'); assert.equal(th.thbTotalCents, th.orderTotalCents);
  assert.equal(my.region, 'my'); assert.equal(my.currency, 'MYR'); assert.equal(my.thbTotalCents, 397486); assert.equal(my.fxRateToThb, 8.2495);
  assert.deepEqual(result.regions.map(r => r.region), ['th', 'my']);
});

test('an order whose currency does not match its shop region is rejected', () => {
  const data = report();
  data.orders[0] = { ...data.orders[0], region: 'my' };
  assert.throws(() => validateShopeeSnapshot(data), /region or currency/);
});
