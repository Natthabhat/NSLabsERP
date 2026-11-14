import { ebayOrderStatus } from './ebay-status.mjs';
import { etsyOrderStatus } from './etsy-status.mjs';
import { lazadaOrderStatus } from './lazada-status.mjs';

// Links ST sales log rows to the platform orders imported from Shopee, Lazada, Etsy and eBay.
// The log has no order numbers, so each row is paired with the closest-dated unused order line for the same
// product code and platform (within MAX_DAYS). Multi-model orders are split across their models, and
// quantities above one can match several rows. The log itself is never changed.
const MAX_DAYS = 4, DAY = 86400000;
const PAGES = { Shopee: '/shopee', Lazada: '/lazada', Etsy: '/etsy', Ebay: '/ebay' };
const code = sku => /^(ST\d{3})/i.exec(String(sku || '').trim())?.[1].toUpperCase() || null;
const bangkokDay = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 7 * 3600000).toISOString().slice(0, 10) : null; };
const localDay = text => /^\d{4}-\d{2}-\d{2}/.exec(String(text || ''))?.[0] || null;
const baht = cents => cents == null || !Number.isFinite(cents) ? null : Math.round(cents) / 100;

// Turns one order into per-model lines with per-unit buyer payment and (when known) after-fees value in THB.
export function orderLines(platform, order, status = order.status) {
  const items = (order.items || []).map(i => ({ ...i, code: code(i.sku), units: Number.isSafeInteger(i.quantity) && i.quantity > 0 ? i.quantity : 1 }));
  if (!items.some(i => i.code)) return [];
  const value = i => i.lineSubtotalCents ?? (i.unitPriceCents != null ? i.unitPriceCents * i.units : Number.isFinite(Number(i.price)) ? Math.round(Number(i.price) * 100) * i.units : null);
  const values = items.map(value), known = values.every(v => v != null && v >= 0), sum = known ? values.reduce((a, b) => a + b, 0) : 0;
  const totalUnits = items.reduce((n, i) => n + i.units, 0);
  let thb = order.thbTotalCents ?? (!order.currency || order.currency === 'THB' ? order.orderTotalCents : null);
  if (thb == null && platform === 'Lazada' && Number.isFinite(Number(order.price))) thb = Math.round(Number(order.price) * 100);
  const rate = order.orderTotalCents > 0 && thb != null ? thb / order.orderTotalCents : null;
  const net = platform === 'Ebay' && order.marketplaceFeeCents != null && order.orderTotalCents != null ? order.orderTotalCents - order.marketplaceFeeCents
    : platform === 'Etsy' && order.netCents != null ? order.netCents
    : platform === 'Shopee' && order.feesCents != null && order.orderTotalCents != null ? order.orderTotalCents - order.feesCents : null;
  const netThb = net != null && rate != null ? net * rate : null;
  const day = platform === 'Ebay' || platform === 'Etsy' ? bangkokDay(order.createdAt) : localDay(order.createdAt);
  return items.map((item, index) => {
    const share = known && sum > 0 ? values[index] / sum : item.units / totalUnits;
    return { platform, orderId: order.orderId, lineKey: String(item.lineKey ?? index), status, day, code: item.code, units: item.units, currency: order.currency || 'THB',
      buyerThb: thb == null ? null : thb * share / item.units, afterFeesThb: netThb == null ? null : netThb * share / item.units };
  }).filter(l => l.code && l.day);
}

export function matchStLog(rows, lines) { return assignStLog(rows, lines).links; }
// Pairs rows with lines and also returns each line's units that no row claimed.
export function assignStLog(rows, lines) {
  const remaining = lines.map(l => ({ ...l, left: l.units }));
  const links = new Map();
  for (const row of [...rows].sort((a, b) => a.sale_date.localeCompare(b.sale_date) || a.id - b.id)) {
    const day = Date.parse(row.sale_date);
    let best = null, bestGap = Infinity;
    for (const line of remaining) {
      if (!line.left || line.platform !== row.platform || line.code !== String(row.product_code).toUpperCase()) continue;
      const gap = Math.abs(Date.parse(line.day) - day) / DAY;
      if (gap <= MAX_DAYS && (gap < bestGap || (gap === bestGap && line.day < best.day))) { best = line; bestGap = gap; }
    }
    if (!best) continue;
    best.left--;
    links.set(row.id, { platform: row.platform, orderId: best.orderId, href: `${PAGES[row.platform]}?order=${encodeURIComponent(best.orderId)}${best.status ? `&status=${encodeURIComponent(best.status)}` : ''}`, orderDate: best.day, currency: best.currency,
      buyerThb: baht(best.buyerThb), afterFeesThb: baht(best.afterFeesThb), feesKnown: best.afterFeesThb != null });
  }
  return { links, remaining };
}

export async function loadStLogData(client) {
  const rows = (await client.query("SELECT id,product_code,platform::text AS platform,to_char(sale_date,'YYYY-MM-DD') AS sale_date FROM public.st_sales_log")).rows;
  const lines = [];
  const load = async (sql, platform, status) => {
    for (const { payload } of (await client.query(sql)).rows) { const value = status(payload); if (value) lines.push(...orderLines(platform, payload, value)); }
  };
  // Tables of integrations that have not been set up yet may be empty; a missing table is not an error here.
  const safe = work => work.catch(error => { if (error.code !== '42P01') throw error; });
  await safe(load("SELECT payload FROM erp_web.shopee_orders WHERE payload::text ILIKE '%ST0%'", 'Shopee', p => p.status));
  await safe(load("SELECT payload FROM erp_web.lazada_orders WHERE payload::text ILIKE '%ST0%'", 'Lazada', p => lazadaOrderStatus(p.statuses)));
  await safe(load('SELECT payload FROM erp_web.etsy_orders', 'Etsy', p => etsyOrderStatus(p)));
  await safe(load('SELECT payload FROM erp_web.ebay_orders', 'Ebay', p => ebayOrderStatus(p)));
  return { rows, lines };
}
export async function stLogLinks(client) { const { rows, lines } = await loadStLogData(client); return matchStLog(rows, lines); }
