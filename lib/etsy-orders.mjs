import { database } from './database.mjs';
import { etsyOrderStatus } from './etsy-status.mjs';
export { ETSY_ORDER_STATUSES, etsyOrderStatus } from './etsy-status.mjs';

const text = (value, max = 500) => typeof value === 'string' ? value.slice(0, max) : '';
const cents = money => {
  const amount = Number(money?.amount), divisor = Number(money?.divisor) || 100;
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount / divisor * 100) : null;
};
const iso = seconds => Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? new Date(Number(seconds) * 1000).toISOString() : null;


// Keeps operational fields only: no buyer name, address, email or messages are stored.
export function normalizeEtsyReceipt(r) {
  const receiptId = String(r?.receipt_id ?? '');
  if (!/^\d{1,20}$/.test(receiptId)) throw Error('Invalid Etsy receipt ID');
  const total = r.grandtotal || r.total_price;
  const items = (Array.isArray(r.transactions) ? r.transactions : []).map(t => ({
    lineKey: String(t.transaction_id ?? ''), product: text(t.title, 300) || 'Unnamed product', sku: text(t.sku, 120),
    // Personalization is free text written by the buyer, so it is not stored.
    variation: (Array.isArray(t.variations) ? t.variations : []).filter(v => !/personali[sz]ation/i.test(String(v.formatted_name))).map(v => `${text(v.formatted_name, 60)}: ${text(v.formatted_value, 120)}`).join(', ').slice(0, 300),
    quantity: Number.isSafeInteger(t.quantity) && t.quantity > 0 ? t.quantity : 1, unitPriceCents: cents(t.price), listingId: t.listing_id ? String(t.listing_id) : null, productId: t.product_id ? String(t.product_id) : null,
  })).filter(i => i.lineKey);
  return {
    orderId: receiptId, etsyStatus: text(r.status, 40).toLowerCase(), paid: r.is_paid === true, shipped: r.is_shipped === true, delivered: false,
    createdAt: iso(r.created_timestamp ?? r.create_timestamp), updatedAt: iso(r.updated_timestamp ?? r.update_timestamp),
    currency: text(total?.currency_code, 3).toUpperCase() || 'USD', orderTotalCents: cents(total), shippingCents: cents(r.total_shipping_cost),
    country: text(r.country_iso, 2), carriers: [...new Set((r.shipments || []).map(s => text(s.carrier_name, 60)).filter(Boolean))], items,
  };
}

// THB equivalent at the ECB daily reference rate, as for Shopee's overseas shops.
export async function thbRate(currency, day, cache, fetcher = fetch) {
  if (currency === 'THB') return 1;
  const key = `${currency}:${day}`;
  if (key in cache) return cache[key];
  try {
    const r = await fetcher(`https://api.frankfurter.app/${day}?from=${encodeURIComponent(currency)}&to=THB`, { signal: AbortSignal.timeout(15000) });
    const rate = r.ok ? (await r.json()).rates?.THB : null;
    cache[key] = Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch { cache[key] = null; }
  return cache[key];
}
export async function addThb(orders, cache = {}, fetcher) {
  const today = new Date().toISOString().slice(0, 10);
  for (const o of orders) {
    const day = (o.createdAt || today).slice(0, 10) > today ? today : (o.createdAt || today).slice(0, 10);
    const rate = await thbRate(o.currency, day, cache, fetcher);
    o.fxRateToThb = rate; o.fxDate = o.currency === 'THB' ? null : day;
    o.thbTotalCents = o.orderTotalCents === null || rate === null ? null : Math.round(o.orderTotalCents * rate);
  }
  return orders;
}

// Etsy keeps the SKU recorded at sale time on each order, and editing a listing's SKUs gives its variations
// new product IDs. Use the listing's current SKU for the same product or variation, so fixed SKUs apply to
// past orders too; the SKU recorded at sale is kept as etsySku. One inventory read per listing per sync.
const values = v => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export async function resolveCurrentSkus(orders, read, cache = new Map()) {
  for (const item of orders.flatMap(o => o.items)) {
    if (!item.listingId || !/^\d{1,20}$/.test(item.listingId)) continue;
    if (!cache.has(item.listingId)) {
      let products = [];
      try {
        const inventory = await read(`/v3/application/listings/${item.listingId}/inventory`, {});
        products = (Array.isArray(inventory?.products) ? inventory.products : []).filter(p => !p.is_deleted).map(p => ({
          id: String(p.product_id), sku: text(p.sku, 120), values: (p.property_values || []).flatMap(v => v.values || []).map(values).filter(Boolean),
        }));
      } catch {}
      cache.set(item.listingId, products);
    }
    const products = cache.get(item.listingId), variation = values(item.variation);
    const match = products.find(p => p.id === item.productId)
      || (products.length === 1 ? products[0] : null)
      || (() => { const hits = products.filter(p => p.values.length && p.values.every(v => variation.includes(v))); return hits.length === 1 ? hits[0] : null; })();
    if (!match?.sku || match.sku === item.sku) continue;
    if (item.sku) item.etsySku = item.sku;
    item.sku = match.sku;
  }
  return orders;
}

export async function writeEtsyOrders(client, shopId, orders, observedAt, delivered = new Set()) {
  if (!orders.length) return;
  const old = new Map((await client.query('SELECT receipt_id,payload FROM erp_web.etsy_orders WHERE shop_id=$1 AND receipt_id=ANY($2::text[]) FOR UPDATE', [shopId, orders.map(o => o.orderId)])).rows.map(r => [r.receipt_id, r.payload]));
  for (const order of orders) {
    // Delivery is learned from a separate filtered query and never forgotten.
    const payload = { ...order, delivered: order.delivered || delivered.has(order.orderId) || old.get(order.orderId)?.delivered === true };
    await client.query(`INSERT INTO erp_web.etsy_orders(shop_id,receipt_id,status,payload,source_updated_at,last_seen) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(shop_id,receipt_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,source_updated_at=excluded.source_updated_at,last_seen=excluded.last_seen`,
      [shopId, order.orderId, etsyOrderStatus(payload), payload, order.updatedAt, observedAt]);
  }
}
export async function markEtsyDelivered(client, shopId, ids) {
  if (!ids.length) return;
  await client.query(`UPDATE erp_web.etsy_orders SET payload=payload||'{"delivered":true}'::jsonb,status=CASE WHEN status IS NULL THEN NULL ELSE 'Complete' END WHERE shop_id=$1 AND receipt_id=ANY($2::text[]) AND NOT COALESCE((payload->>'delivered')::boolean,false)`, [shopId, ids]);
}

async function pages(read, shopId, query, onPage) {
  for (let offset = query.offset || 0; ; ) {
    const data = await read(`/v3/application/shops/${Number(shopId)}/receipts`, { ...query, limit: 100, offset });
    const rows = Array.isArray(data?.results) ? data.results : null;
    if (!rows) throw Error('Unexpected Etsy receipts response');
    offset += rows.length;
    await onPage(rows, offset);
    if (rows.length < 100 || (Number.isFinite(data.count) && offset >= data.count)) return;
  }
}
async function saved(pool, work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('etsy-saved-orders',0))"); await work(client); await client.query('COMMIT'); }
  catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
async function deliveredIds(read, shopId, since) {
  const ids = [];
  await pages(read, shopId, { was_delivered: true, ...(since ? { min_last_modified: since } : {}), sort_on: 'updated', sort_order: 'asc' }, rows => { ids.push(...rows.map(r => String(r.receipt_id))); });
  return ids;
}

// First run imports the full history, checkpointing after every page; later runs fetch receipts changed since the last sync.
export async function syncEtsyOrders(access, read, { pool = database(), fetcher } = {}) {
  const guard = await pool.connect();
  try {
    const lock = await guard.query("SELECT pg_try_advisory_lock(hashtextextended('etsy-sync',0)) AS acquired");
    if (!lock.rows[0].acquired) return readEtsyHistory(access.shopId, pool);
    try {
      const shopId = access.shopId, fx = {}, skus = new Map();
      await guard.query('INSERT INTO erp_web.etsy_sync_state(shop_id) VALUES($1) ON CONFLICT DO NOTHING', [shopId]);
      const state = (await guard.query('SELECT * FROM erp_web.etsy_sync_state WHERE shop_id=$1', [shopId])).rows[0];
      try {
        if (state.import_status !== 'complete') {
          const started = state.import_started_at || new Date();
          await guard.query("UPDATE erp_web.etsy_sync_state SET import_status='running',import_started_at=$2,error=NULL,updated_at=now() WHERE shop_id=$1", [shopId, started]);
          await pages(read, shopId, { sort_on: 'created', sort_order: 'asc', offset: state.next_offset }, async (rows, offset) => {
            const orders = await addThb(await resolveCurrentSkus(rows.map(normalizeEtsyReceipt), read, skus), fx, fetcher);
            await saved(pool, async c => { await writeEtsyOrders(c, shopId, orders, new Date().toISOString()); await c.query('UPDATE erp_web.etsy_sync_state SET next_offset=$2,updated_at=now() WHERE shop_id=$1', [shopId, offset]); });
          });
          const delivered = await deliveredIds(read, shopId);
          await saved(pool, c => markEtsyDelivered(c, shopId, delivered));
          await guard.query("UPDATE erp_web.etsy_sync_state SET import_status='complete',last_sync_at=import_started_at,updated_at=now() WHERE shop_id=$1", [shopId]);
        } else {
          const end = new Date(), since = Math.floor(Date.parse(state.last_sync_at) / 1000) - 300;
          await pages(read, shopId, { min_last_modified: since, sort_on: 'updated', sort_order: 'asc' }, async rows => {
            const orders = await addThb(await resolveCurrentSkus(rows.map(normalizeEtsyReceipt), read, skus), fx, fetcher);
            await saved(pool, c => writeEtsyOrders(c, shopId, orders, new Date().toISOString()));
          });
          const delivered = await deliveredIds(read, shopId, since);
          await saved(pool, c => markEtsyDelivered(c, shopId, delivered));
          await guard.query('UPDATE erp_web.etsy_sync_state SET last_sync_at=GREATEST(last_sync_at,$2::timestamptz),error=NULL,updated_at=now() WHERE shop_id=$1', [shopId, end]);
        }
      } catch (error) {
        await guard.query("UPDATE erp_web.etsy_sync_state SET import_status=CASE WHEN import_status='complete' THEN 'complete' ELSE 'error' END,error=$2,updated_at=now() WHERE shop_id=$1", [shopId, error.status ? error.message : 'Etsy sync stopped. Refresh data to resume from the last saved page.']).catch(() => {});
        throw error;
      }
      await pool.query('UPDATE erp_web.etsy_connection SET checked_at=now() WHERE id=true');
      return readEtsyHistory(shopId, pool);
    } finally { await guard.query("SELECT pg_advisory_unlock(hashtextextended('etsy-sync',0))").catch(() => {}); }
  } finally { guard.release(); }
}

export async function readEtsyHistory(shopId, pool = database()) {
  const rows = await pool.query("SELECT payload FROM erp_web.etsy_orders WHERE shop_id=$1 ORDER BY payload->>'createdAt' DESC,receipt_id DESC", [shopId]);
  const state = (await pool.query('SELECT import_status,last_sync_at,error FROM erp_web.etsy_sync_state WHERE shop_id=$1', [shopId])).rows[0];
  const checked = (await pool.query('SELECT checked_at FROM erp_web.etsy_connection WHERE id=true')).rows[0]?.checked_at;
  return { orders: rows.rows.map(r => ({ ...r.payload, status: etsyOrderStatus(r.payload) })), storedCount: rows.rowCount, importStatus: state?.import_status || 'pending', importing: state?.import_status === 'running', syncError: state?.error || null, checkedAt: checked ? new Date(checked).toISOString() : null };
}
