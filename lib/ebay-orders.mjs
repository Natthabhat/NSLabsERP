import { database } from './database.mjs';
import { ebayOrderStatus } from './ebay-status.mjs';
import { addThb, thbRate } from './fx.mjs';
export { EBAY_ORDER_STATUSES, ebayOrderStatus } from './ebay-status.mjs';

const ORDERS = 'https://api.ebay.com/sell/fulfillment/v1/order';
const PAYOUTS = 'https://apiz.ebay.com/sell/finances/v1/payout';
const text = (value, max = 500) => typeof value === 'string' ? value.slice(0, max) : '';
const cents = amount => { const n = Number(amount?.value); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

// Keeps operational fields only: no buyer username, name, address, phone or checkout notes are stored.
export function normalizeEbayOrder(o) {
  const orderId = String(o?.orderId ?? '');
  if (!/^[0-9A-Za-z-]{5,40}$/.test(orderId)) throw Error('Invalid eBay order ID');
  const items = (Array.isArray(o.lineItems) ? o.lineItems : []).map(l => {
    const quantity = Number.isSafeInteger(l.quantity) && l.quantity > 0 ? l.quantity : 1, lineCents = cents(l.lineItemCost);
    return {
      lineKey: String(l.lineItemId ?? ''), product: text(l.title, 300) || 'Unnamed product', sku: text(l.sku, 120),
      variation: (Array.isArray(l.variationAspects) ? l.variationAspects : []).map(a => `${text(a.name, 60)}: ${text(a.value, 120)}`).join(', ').slice(0, 300),
      quantity, unitPriceCents: lineCents === null ? null : Math.round(lineCents / quantity), lineSubtotalCents: lineCents,
      listingId: l.legacyItemId ? String(l.legacyItemId) : null,
    };
  }).filter(i => i.lineKey);
  const ship = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress;
  return {
    orderId, paymentStatus: text(o.orderPaymentStatus, 40), fulfillmentStatus: text(o.orderFulfillmentStatus, 40), cancelState: text(o.cancelStatus?.cancelState, 40),
    createdAt: iso(o.creationDate), updatedAt: iso(o.lastModifiedDate),
    currency: text(o.pricingSummary?.total?.currency, 3).toUpperCase() || 'USD', orderTotalCents: cents(o.pricingSummary?.total),
    marketplaceFeeCents: cents(o.totalMarketplaceFee), country: text(ship?.countryCode, 2), items,
  };
}
export function normalizeEbayPayout(p) {
  const payoutId = String(p?.payoutId ?? '');
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(payoutId)) throw Error('Invalid eBay payout ID');
  return {
    payoutId, status: text(p.payoutStatus, 40) || 'UNKNOWN', payoutDate: iso(p.payoutDate || p.lastAttemptedPayoutDate),
    currency: text(p.amount?.currency, 3).toUpperCase() || 'USD', amountCents: cents(p.amount), feeCents: cents(p.totalFee),
    transactionCount: Number.isSafeInteger(p.transactionCount) ? p.transactionCount : null, instrument: text(p.payoutInstrument?.instrumentType, 40),
  };
}

async function saved(pool, work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ebay-saved-orders',0))"); await work(client); await client.query('COMMIT'); }
  catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function writeEbayOrders(client, seller, orders, observedAt) {
  for (const order of orders) await client.query(`INSERT INTO erp_web.ebay_orders(seller,order_id,status,payload,source_updated_at,last_seen) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(seller,order_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,source_updated_at=excluded.source_updated_at,last_seen=excluded.last_seen`,
    [seller, order.orderId, ebayOrderStatus(order), order, order.updatedAt, observedAt]);
}
async function pages(read, query, key, onPage) {
  for (let offset = query.offset || 0; ; ) {
    const data = await read(query.url, { ...query.params, limit: 200, offset });
    // eBay omits the list when nothing matches; a missing list with a positive total is an error.
    if (!Array.isArray(data?.[key]) && Number(data?.total) > 0) throw Error('Unexpected eBay response');
    const rows = Array.isArray(data?.[key]) ? data[key] : [];
    offset += rows.length;
    await onPage(rows, offset);
    if (rows.length < 200 || (Number.isFinite(data.total) && offset >= data.total)) return;
  }
}
const range = (from, to) => `[${new Date(from).toISOString()}..${to ? new Date(to).toISOString() : ''}]`;

// First run imports two years of orders (eBay's limit) in a fixed window, checkpointing every page;
// later runs read orders modified since the last sync. Payouts (last five years) are refreshed every run.
export async function syncEbay(access, read, { pool = database(), fetcher } = {}) {
  const guard = await pool.connect();
  try {
    const lock = await guard.query("SELECT pg_try_advisory_lock(hashtextextended('ebay-sync',0)) AS acquired");
    if (!lock.rows[0].acquired) return readEbayHistory(access.seller, pool);
    try {
      const seller = access.seller, fx = {};
      await guard.query('INSERT INTO erp_web.ebay_sync_state(seller) VALUES($1) ON CONFLICT DO NOTHING', [seller]);
      const state = (await guard.query('SELECT * FROM erp_web.ebay_sync_state WHERE seller=$1', [seller])).rows[0];
      try {
        const save = rows => addThb(rows.map(normalizeEbayOrder), fx, fetcher);
        if (state.import_status !== 'complete') {
          const end = state.import_started_at ? new Date(state.import_started_at) : new Date();
          await guard.query("UPDATE erp_web.ebay_sync_state SET import_status='running',import_started_at=$2,error=NULL,updated_at=now() WHERE seller=$1", [seller, end]);
          const start = end.getTime() - 729 * 86400000;
          await pages(read, { url: ORDERS, params: { filter: `creationdate:${range(start, end)}` }, offset: state.next_offset }, 'orders', async (rows, offset) => {
            const orders = await save(rows);
            await saved(pool, async c => { await writeEbayOrders(c, seller, orders, new Date().toISOString()); await c.query('UPDATE erp_web.ebay_sync_state SET next_offset=$2,updated_at=now() WHERE seller=$1', [seller, offset]); });
          });
          await guard.query("UPDATE erp_web.ebay_sync_state SET import_status='complete',last_sync_at=import_started_at,updated_at=now() WHERE seller=$1", [seller]);
        } else {
          const end = new Date(), since = Date.parse(state.last_sync_at) - 300000;
          await pages(read, { url: ORDERS, params: { filter: `lastmodifieddate:${range(since)}` } }, 'orders', async rows => {
            const orders = await save(rows);
            await saved(pool, c => writeEbayOrders(c, seller, orders, new Date().toISOString()));
          });
          await guard.query('UPDATE erp_web.ebay_sync_state SET last_sync_at=GREATEST(last_sync_at,$2::timestamptz),error=NULL,updated_at=now() WHERE seller=$1', [seller, end]);
        }
        const payouts = [];
        await pages(read, { url: PAYOUTS, params: { sort: 'payoutDate' } }, 'payouts', rows => { payouts.push(...rows.map(normalizeEbayPayout)); });
        for (const p of payouts) {
          const rate = await thbRate(p.currency, (p.payoutDate || new Date().toISOString()).slice(0, 10), fx, fetcher);
          p.fxRateToThb = rate; p.thbAmountCents = p.amountCents === null || rate === null ? null : Math.round(p.amountCents * rate);
        }
        await saved(pool, async c => { for (const p of payouts) await c.query(`INSERT INTO erp_web.ebay_payouts(seller,payout_id,status,payout_date,payload,last_seen) VALUES($1,$2,$3,$4,$5,now())
          ON CONFLICT(seller,payout_id) DO UPDATE SET status=excluded.status,payout_date=excluded.payout_date,payload=excluded.payload,last_seen=now()`, [seller, p.payoutId, p.status, p.payoutDate, p]); });
      } catch (error) {
        await guard.query("UPDATE erp_web.ebay_sync_state SET import_status=CASE WHEN import_status='complete' THEN 'complete' ELSE 'error' END,error=$2,updated_at=now() WHERE seller=$1", [seller, error.status ? error.message : 'eBay sync stopped. Refresh data to resume from the last saved page.']).catch(() => {});
        throw error;
      }
      await pool.query('UPDATE erp_web.ebay_connection SET checked_at=now() WHERE id=true');
      return readEbayHistory(seller, pool);
    } finally { await guard.query("SELECT pg_advisory_unlock(hashtextextended('ebay-sync',0))").catch(() => {}); }
  } finally { guard.release(); }
}

export async function readEbayHistory(seller, pool = database(), now = Date.now()) {
  const rows = await pool.query("SELECT payload FROM erp_web.ebay_orders WHERE seller=$1 ORDER BY payload->>'createdAt' DESC,order_id DESC", [seller]);
  const payouts = await pool.query('SELECT payload FROM erp_web.ebay_payouts WHERE seller=$1 ORDER BY payout_date DESC NULLS LAST,payout_id DESC', [seller]);
  const state = (await pool.query('SELECT import_status,last_sync_at,error FROM erp_web.ebay_sync_state WHERE seller=$1', [seller])).rows[0];
  const checked = (await pool.query('SELECT checked_at FROM erp_web.ebay_connection WHERE id=true')).rows[0]?.checked_at;
  return { orders: rows.rows.map(r => ({ ...r.payload, status: ebayOrderStatus(r.payload, now) })), payouts: payouts.rows.map(r => r.payload), storedCount: rows.rowCount, importStatus: state?.import_status || 'pending', importing: state?.import_status === 'running', syncError: state?.error || null, checkedAt: checked ? new Date(checked).toISOString() : null };
}
