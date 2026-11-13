import { orderStatus } from './shopee-status.mjs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './security.mjs';

const text = (value, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new AppError('The Shopee report contains an invalid amount or quantity.', 502);
  return value;
}
// SIP shops: Thailand is the primary shop; affiliated shops report in their own currency.
const REGION_CURRENCY = { th: 'THB', my: 'MYR', ph: 'PHP', sg: 'SGD', vn: 'VND' };
function region(order) {
  const value = order.region ?? 'th';
  if (!(value in REGION_CURRENCY) || REGION_CURRENCY[value] !== (order.currency ?? 'THB')) throw new AppError('The Shopee report contains an order with an unknown shop region or currency.', 502);
  return value;
}
export function validateShopeeSnapshot(data) {
  if (!data || data.schemaVersion !== 1 || data.source !== 'shopee-seller-centre' || !['to_ship','three_statuses'].includes(data.scope) || !Array.isArray(data.orders) || data.orders.length > 50000 || !Number.isFinite(Date.parse(data.collectedAt))) {
    throw new AppError('The Shopee report format is not supported. Check the collector workflow.', 502);
  }
  const seen = new Set();
  const orders = data.orders.map(order => {
    if (!order || typeof order.orderId !== 'string' || !order.orderId || order.orderId.length > 100 || seen.has(order.orderId) || !Array.isArray(order.items) || !order.items.length || order.items.length > 1000) throw new AppError('The Shopee report contains an invalid or duplicate order.', 502);
    seen.add(order.orderId);
    const lines = new Set();
    const items = order.items.map(item => {
      if (!item || typeof item.lineKey !== 'string' || !item.lineKey || lines.has(item.lineKey) || typeof item.product !== 'string' || !item.product || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new AppError('The Shopee report contains an invalid order item.', 502);
      lines.add(item.lineKey);
      const unitPriceCents = cents(item.unitPriceCents), lineSubtotalCents = cents(item.lineSubtotalCents);
      if (unitPriceCents * item.quantity !== lineSubtotalCents) throw new AppError('Shopee item amounts do not match their quantities.', 502);
      return { lineKey: text(item.lineKey, 100), product: text(item.product), sku: text(item.sku, 120), parentSku: text(item.parentSku,120), variation: text(item.variation, 200), quantity: item.quantity, unitPriceCents, lineSubtotalCents };
    });
    const shop = region(order), currency = REGION_CURRENCY[shop];
    const orderTotalCents = order.orderTotalCents === null ? null : cents(order.orderTotalCents);
    // THB equivalent for dashboard totals; overseas orders carry the collector's daily reference rate.
    const thbTotalCents = currency === 'THB' ? orderTotalCents : order.thbTotalCents == null ? null : cents(order.thbTotalCents);
    const fxRateToThb = currency === 'THB' ? 1 : Number.isFinite(order.fxRateToThb) && order.fxRateToThb > 0 ? order.fxRateToThb : null;
    return { orderId: order.orderId, region: shop, status: orderStatus(order.status), createdAt: text(order.createdAt, 100), paidAt: text(order.paidAt, 100), currency, orderTotalCents, thbTotalCents, fxRateToThb, fxDate: currency === 'THB' ? null : text(order.fxDate, 10), items };
  });
  const visible = orders.filter(order => order.status);
  const regions = Array.isArray(data.regions) ? data.regions.filter(r => r && r.region in REGION_CURRENCY).map(r => ({ region: r.region, currency: REGION_CURRENCY[r.region], orderCount: Number.isSafeInteger(r.orderCount) ? r.orderCount : 0, ok: r.ok === true, error: text(r.error, 300) })) : [{ region: 'th', currency: 'THB', orderCount: visible.length, ok: true, error: '' }];
  return { source: 'Shopee Seller Centre', shop: text(data.shop, 100), regions, scope: data.scope, dateRange: text(data.dateRange, 100), collectedAt: new Date(data.collectedAt).toISOString(), reportName: text(data.reportName, 200), orderCount: visible.length, itemCount: visible.reduce((n, order) => n + order.items.length, 0), orders: visible };
}

async function readJson(path) {
  const info = await stat(path);
  if (info.size > 20_000_000) throw new AppError('The Shopee snapshot is too large to display.', 502);
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function readShopeeSnapshot(directory = process.env.SHOPEE_SNAPSHOT_DIR || '/var/lib/nslabs-shopee') {
  let collector = null;
  try {
    const state = await readJson(join(directory, 'status.json'));
    collector = { status: text(state.status, 50), lastRun: text(state.lastRun, 100), lastSuccess: text(state.lastSuccess, 100) };
  } catch (error) { if (error.code !== 'ENOENT') throw new AppError('The collector status could not be read. Please try again.', 502); }
  try {
    return { available: true, snapshot: validateShopeeSnapshot(await readJson(join(directory, 'latest-orders.json'))), collector };
  } catch (error) {
    if (error.code === 'ENOENT') return { available: false, snapshot: null, collector };
    if (error instanceof AppError) throw error;
    throw new AppError('The Shopee report could not be read. Check the latest collector execution.', 502);
  }
}
