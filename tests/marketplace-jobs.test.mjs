import test from 'node:test';
import assert from 'node:assert/strict';
import { msUntilDaily } from '../lib/marketplace-jobs.mjs';

test('the daily refresh runs at the next 06:00 Bangkok time', () => {
  const H = 3600000;
  assert.equal(msUntilDaily(Date.parse('2026-11-14T22:00:00Z')), 1 * H);  // 05:00 Bangkok -> 1 hour
  assert.equal(msUntilDaily(Date.parse('2026-11-14T23:00:00Z')), 24 * H); // exactly 06:00 -> next day
  assert.equal(msUntilDaily(Date.parse('2026-11-14T18:30:00Z')), 4.5 * H); // 01:30 Bangkok -> 4.5 hours
});
