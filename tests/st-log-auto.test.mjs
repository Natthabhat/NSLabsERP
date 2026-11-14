import test from 'node:test';
import assert from 'node:assert/strict';
import { planStLogRows } from '../lib/st-log-auto.mjs';

const line = (platform, orderId, day, code, units = 1, extra = {}) => ({ platform, orderId, lineKey: 'L' + orderId, day, code, units, status: 'Complete', buyerThb: 150000, afterFeesThb: platform === 'Lazada' ? null : 120000, ...extra });

test('only units without a hand-entered or earlier automatic row are planned, from the start date', () => {
  const lines = [line('Shopee', 'A', '2026-01-24', 'ST002', 2), line('Ebay', 'B', '2026-03-04', 'ST003'), line('Etsy', 'C', '2025-12-20', 'ST006'), line('Lazada', 'D', '2026-02-25', 'ST005'), line('Etsy', 'E', '2026-04-26', 'ST006')];
  const rows = [{ id: 1, product_code: 'ST002', platform: 'Shopee', sale_date: '2026-01-24' }, { id: 9, product_code: 'ST006', platform: 'Etsy', sale_date: '2026-04-26' }];
  // Row 9 was added automatically for order E earlier: it must not count as a hand-entered row.
  const plan = planStLogRows({ rows, lines }, [{ platform: 'Etsy', order_id: 'E', line_key: 'LE', unit: 1, log_id: 9 }], '2026-01-01');
  assert.deepEqual(plan.map(p => [p.platform, p.orderId, p.unit, p.code, p.day, p.price, p.shipping, p.basis]), [
    ['Shopee', 'A', 1, 'ST002', '2026-01-24', 1200, 0, 'after_fees'],   // second unit of A (first is hand-entered)
    ['Lazada', 'D', 1, 'ST005', '2026-02-25', 1500, 0, 'buyer_payment'], // no fees reported
    ['Ebay', 'B', 1, 'ST003', '2026-03-04', 1200, 700, 'after_fees'],
  ]);
});

test('a line already added automatically is not planned again, and lines without any amount are skipped', () => {
  const lines = [line('Ebay', 'B', '2026-03-04', 'ST003', 2), line('Shopee', 'F', '2026-05-01', 'ST004', 1, { buyerThb: null, afterFeesThb: null })];
  const plan = planStLogRows({ rows: [{ id: 5, product_code: 'ST003', platform: 'Ebay', sale_date: '2026-03-04' }], lines }, [{ platform: 'Ebay', order_id: 'B', line_key: 'LB', unit: 1, log_id: 5 }], '2026-01-01');
  assert.deepEqual(plan.map(p => [p.orderId, p.unit]), [['B', 2]]);
});
