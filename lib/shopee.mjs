import { orderStatus } from './shopee-status.mjs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './security.mjs';

const text = (value, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new AppError('The Shopee report contains an invalid amount or quantity.', 502);
  return value;
}
export function validateShopeeSnapshot(data) {
  if (!data || data.schemaVersion !== 1 || data.source !== 'shopee-seller-centre' || !['to_ship','three_statuses'].includes(data.scope) || !Array.isArray(data.orders) || data.orders.length > 50000 || !Number.isFinite(Date.parse(data.collectedAt))) {
    throw new AppError('The Shopee report format is not supported. Check the collector workflow.', 502);
  }
  const seen = new Set();
  const orders = data.orders.map(order => {
    if (!order || order.currency !== 'THB' || typeof order.orderId !== 'string' || !order.orderId || order.orderId.length > 100 || seen.has(order.orderId) || !Array.isArray(order.items) || !order.items.length || order.items.length > 1000) throw new AppError('The Shopee report contains an invalid or duplicate order.', 502);
    seen.add(order.orderId);
    const lines = new Set();
    const items = order.items.map(item => {
      if (!item || typeof item.lineKey !== 'string' || !item.lineKey || lines.has(item.lineKey) || typeof item.product !== 'string' || !item.product || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new AppError('The Shopee report contains an invalid order item.', 502);
      lines.add(item.lineKey);
      const unitPriceCents = cents(item.unitPriceCents), lineSubtotalCents = cents(item.lineSubtotalCents);
      if (unitPriceCents * item.quantity !== lineSubtotalCents) throw new AppError('Shopee item amounts do not match their quantities.', 502);
      return { lineKey: text(item.lineKey, 100), product: text(item.product), sku: text(item.sku, 120), variation: text(item.variation, 200), quantity: item.quantity, unitPriceCents, lineSubtotalCents };
    });
    return { orderId: order.orderId, status: orderStatus(order.status), createdAt: text(order.createdAt, 100), paidAt: text(order.paidAt, 100), currency: 'THB', orderTotalCents: order.orderTotalCents === null ? null : cents(order.orderTotalCents), items };
  });
  const visible = orders.filter(order => order.status);
  return { source: 'Shopee Seller Centre', shop: text(data.shop, 100), scope: data.scope, dateRange: text(data.dateRange, 100), collectedAt: new Date(data.collectedAt).toISOString(), reportName: text(data.reportName, 200), orderCount: visible.length, itemCount: visible.reduce((n, order) => n + order.items.length, 0), orders: visible };
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
