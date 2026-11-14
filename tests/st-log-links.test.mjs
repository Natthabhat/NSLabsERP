import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLines, matchStLog } from '../lib/st-log-links.mjs';

test('orders split into per-model lines with per-unit buyer payment and after-fees value in THB', () => {
  // Shopee multi-model order, THB, no fees in the data.
  const shopee = orderLines('Shopee', { orderId: 'S1', createdAt: '2026-01-24 10:00', currency: 'THB', orderTotalCents: 450000, items: [
    { sku: 'ST002', quantity: 2, unitPriceCents: 150000, lineSubtotalCents: 300000 }, { sku: 'ST005M', quantity: 1, unitPriceCents: 150000, lineSubtotalCents: 150000 }, { sku: 'N003B', quantity: 1, lineSubtotalCents: 0 }] }, 'Complete');
  assert.deepEqual(shopee.map(l => [l.code, l.units, l.day, l.buyerThb, l.afterFeesThb, l.status]), [['ST002', 2, '2026-01-24', 150000, null, 'Complete'], ['ST005', 1, '2026-01-24', 150000, null, 'Complete']]);
  // eBay: USD total with THB equivalent and marketplace fee; created late on Oct 31 UTC is Nov 1 in Bangkok.
  const [ebay] = orderLines('Ebay', { orderId: 'E1', createdAt: '2026-10-31T20:00:00Z', currency: 'USD', orderTotalCents: 12999, thbTotalCents: 438456, marketplaceFeeCents: 2116, items: [{ sku: 'ST002', quantity: 1, lineSubtotalCents: 12999 }] }, 'Shipped');
  assert.equal(ebay.day, '2026-11-01'); assert.equal(Math.round(ebay.buyerThb), 438456); assert.equal(Math.round(ebay.afterFeesThb), Math.round((12999 - 2116) * 438456 / 12999));
  // Etsy: net from the payment record.
  const [etsy] = orderLines('Etsy', { orderId: 'T1', createdAt: '2026-10-22T03:00:00Z', currency: 'USD', orderTotalCents: 10614, thbTotalCents: 358169, netCents: 8982, items: [{ sku: 'ST011M', quantity: 1, unitPriceCents: 10614 }] });
  assert.equal(etsy.code, 'ST011'); assert.equal(Math.round(etsy.afterFeesThb), Math.round(8982 * 358169 / 10614));
  // Lazada keeps its price as a string in THB.
  const [lazada] = orderLines('Lazada', { orderId: 'L1', createdAt: '2026-02-25 13:44:01 +0700', price: '1290.00', items: [{ sku: 'ST005', quantity: 1, price: '1290.00' }] });
  assert.equal(lazada.buyerThb, 129000); assert.equal(lazada.day, '2026-02-25');
  assert.deepEqual(orderLines('Shopee', { orderId: 'X', createdAt: '2026-01-01', items: [{ sku: 'N001', quantity: 1 }] }), []);
});

test('log rows pair with the closest unused order line of the same platform and product within 4 days', () => {
  const line = (platform, orderId, day, code, units = 1) => ({ platform, orderId, day, code, units, currency: 'THB', status: 'Complete', buyerThb: 100000, afterFeesThb: platform === 'Ebay' ? 80000 : null });
  const lines = [line('Shopee', 'A', '2026-01-24', 'ST002', 2), line('Shopee', 'B', '2026-01-30', 'ST002'), line('Ebay', 'C', '2026-03-05', 'ST003'), line('Etsy', 'D', '2026-03-05', 'ST003')];
  const rows = [
    { id: 1, product_code: 'ST002', platform: 'Shopee', sale_date: '2026-01-24' },
    { id: 2, product_code: 'ST002', platform: 'Shopee', sale_date: '2026-01-24' }, // second unit of order A
    { id: 3, product_code: 'ST002', platform: 'Shopee', sale_date: '2026-01-25' }, // A used up; B is 5 days away
    { id: 4, product_code: 'ST003', platform: 'Ebay', sale_date: '2026-03-04' },
    { id: 5, product_code: 'ST003', platform: 'Ebay', sale_date: '2026-03-04' },   // only one eBay line
  ];
  const links = matchStLog(rows, lines);
  assert.equal(links.get(1).orderId, 'A'); assert.equal(links.get(2).orderId, 'A'); assert.equal(links.get(3), undefined);
  assert.equal(links.get(4).orderId, 'C'); assert.equal(links.get(4).afterFeesThb, 800); assert.equal(links.get(4).feesKnown, true); assert.equal(links.get(5), undefined);
  assert.equal(links.get(1).buyerThb, 1000); assert.equal(links.get(1).feesKnown, false);
  assert.equal(links.get(4).href, '/ebay?order=C&status=Complete');
});
