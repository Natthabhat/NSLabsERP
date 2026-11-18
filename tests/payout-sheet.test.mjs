import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPayoutCode, planPayoutRows } from '../lib/payout-sheet.mjs';

test('next payout code continues the platform series whatever the spacing', () => {
  assert.equal(nextPayoutCode('Etsy', ['Etsy 1', 'Etsy 13', 'Etsy14']), 'Etsy 15');
  assert.equal(nextPayoutCode('Ebay', ['Ebay 22', 'Ebay23', 'Ebay24']), 'Ebay 25');
  assert.equal(nextPayoutCode('Etsy', []), 'Etsy 1');
});

test('only payouts without a linked sheet row are planned, in date order with consecutive codes', () => {
  const p = (platform, payoutId, payoutDate, thb) => ({ platform, payoutId, payoutDate, currency: 'USD', amountCents: 10000, thbAmountCents: thb });
  const payouts = [p('Etsy', '9', '2026-11-16T10:00:00Z', 725415), p('Etsy', '5', '2026-06-08T10:00:00Z', 200653), p('Etsy', '1', '2025-11-24T10:00:00Z', 235879), p('Ebay', '7', '2026-04-07T00:00:00Z', 407000), p('Ebay', '8', '2026-05-01T00:00:00Z', null)];
  const plan = planPayoutRows(payouts, new Set(['Etsy|1']), { Etsy: ['Etsy 13', 'Etsy14'], Ebay: ['Ebay24'] });
  assert.deepEqual(plan.map(r => [r.platform, r.payoutId, r.code, r.date, r.amountThb]), [
    ['Ebay', '7', 'Ebay 25', '2026-04-07', 4070], ['Etsy', '5', 'Etsy 15', '2026-06-08', 2006.53], ['Etsy', '9', 'Etsy 16', '2026-11-16', 7254.15]]);
});
