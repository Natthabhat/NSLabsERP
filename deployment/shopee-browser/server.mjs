import http from 'node:http';
import { mkdir, writeFile, readFile, chmod, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { orderStatus } from './order-status.mjs';

const ROOT = '/data';
const ORDER_URL = 'https://seller.shopee.co.th/portal/sale/order';
await mkdir(ROOT, { recursive: true, mode: 0o700 }); await chmod(ROOT, 0o700);
await mkdir('/export', { recursive: true, mode: 0o755 });
let context, page, busy = false;
const state = { status: 'starting', message: 'Starting browser.', lastRun: null, lastSuccess: null };
try { const saved = JSON.parse(await readFile(`${ROOT}/status.json`, 'utf8')); state.lastRun = saved.lastRun || null; state.lastSuccess = saved.lastSuccess || null; } catch {}
async function publishFile(name, data) {
  await writeFile(`/export/${name}.tmp`, JSON.stringify(data, null, 2), { mode: 0o644 });
  await rename(`/export/${name}.tmp`, `/export/${name}`);
}
// Seed the read-only ERP view from the most recent successful report after restart.
try { await publishFile('latest-orders.json', JSON.parse(await readFile(`${ROOT}/latest-orders.json`, 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
async function browser() {
  if (context) return;
  context = await chromium.launchPersistentContext(`${ROOT}/profile`, { headless: false, viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'Asia/Bangkok', acceptDownloads: true });
  context.setDefaultTimeout(15000);
  page = context.pages()[0] || await context.newPage();
  state.status = 'ready'; state.message = 'Browser ready. Shop login has not been checked.';
}
function response(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 10000) throw Error('Request too large.'); } return JSON.parse(text || '{}'); }
async function saveState() { await writeFile(`${ROOT}/status.json`, JSON.stringify(state), { mode: 0o600 }); await publishFile('status.json', { status: state.status, lastRun: state.lastRun, lastSuccess: state.lastSuccess }); }
async function needsLogin() { return !(await page.getByRole('button', { name: /^Export$|^ส่งออก$/i }).first().isVisible()); }
async function authStep() {
  if (page.url().includes('/verify/ivs')) {
    const verify = page.getByRole('button', { name: /ยืนยันตัวตนผ่านลิงก์|verify.*link/i });
    if (await verify.count()) await verify.click();
  }
  const url = page.url();
  if (url.includes('/verify/')) { state.status = 'verification_required'; state.message = 'Approve the Shopee verification link on your phone. The worker will wait for approval.'; }
  else if (/captcha/i.test(url) || await page.locator('iframe[src*="captcha"]').count()) { state.status = 'verification_required'; state.message = 'Shopee requires manual verification. No bypass is attempted.'; }
  else if (await needsLogin()) { state.status = 'login_required'; state.message = 'Shopee login is required.'; }
  else { state.status = 'connected'; state.message = 'Shopee seller session is connected.'; }
  await page.screenshot({ path: `${ROOT}/session.png` }); await saveState();
}
async function login(email, password) {
  busy = true;
  try {
    await browser(); await page.goto(ORDER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // The initial portal URL can briefly appear before an unauthenticated redirect.
    // Wait for a real page control rather than treating that URL as a successful login.
    await Promise.race([
      page.getByRole('button', { name: /^Export$|^ส่งออก$/i }).first().waitFor({ state: 'visible', timeout: 45000 }),
      page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 45000 }),
    ]);
    if (await needsLogin()) {
      const english = page.getByRole('button', { name: 'English', exact: true });
      if (await english.isVisible()) await english.click();
      const fields = page.locator('input');
      await fields.first().waitFor({ state: 'visible', timeout: 30000 });
      const passwordField = page.locator('input[type="password"]');
      await page.locator('input:not([type="password"]):not([type="checkbox"]):not([type="hidden"])').first().fill(email);
      await passwordField.fill(password);
      await page.getByRole('button', { name: /^(เข้าสู่ระบบ|log in|login)$/i }).click();
      email = ''; password = '';
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); await authStep();
        if (state.status === 'connected') break;
      }
    } else await authStep();
  } catch { state.status = 'login_required'; state.message = 'Login did not complete. Inspect the private session screenshot and retry manually.'; await page?.screenshot({ path: `${ROOT}/session.png` }).catch(() => {}); }
  finally { busy = false; await saveState(); }
}

function value(cell) { const v = cell.value; return v && typeof v === 'object' ? v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : cell.text) : v; }
export async function normalizeReport(buffer) {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  const sheet = book.worksheets[0]; if (!sheet) throw Error('The downloaded report has no worksheet.');
  const headers = sheet.getRow(1).values.map(v => String(v ?? '').trim());
  const col = (...names) => names.map(n => headers.indexOf(n)).find(i => i > 0) ?? -1;
  const columns = {
    orderId: col('หมายเลขคำสั่งซื้อ', 'Order ID', 'Order SN'), status: col('สถานะการสั่งซื้อ', 'Order Status'),
    product: col('ชื่อสินค้า', 'Product Name'), sku: col('เลขอ้างอิง SKU (SKU Reference No.)', 'SKU Reference No.'),
    parentSku: col('เลขอ้างอิง Parent SKU', 'Parent SKU Reference No.'), variation: col('ชื่อตัวเลือก', 'Variation Name'),
    quantity: col('จำนวน', 'Quantity'), unitPrice: col('ราคาขาย', 'Deal Price', 'Discounted Price'),
    createdAt: col('วันที่ทำการสั่งซื้อ', 'Order Creation Date'), paidAt: col('เวลาการชำระสินค้า', 'Order Paid Time'),
    orderTotal: col('จำนวนเงินทั้งหมด', 'Order Total', 'Total Amount'),
  };
  if (['orderId', 'status', 'product', 'quantity', 'unitPrice'].some(key => columns[key] < 1)) throw Error('Report columns changed. No orders were imported.');
  const orders = new Map();
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i), get = key => columns[key] > 0 ? value(row.getCell(columns[key])) ?? '' : '';
    const orderId = String(get('orderId')).trim(); if (!orderId) continue;
    const quantity = Number(get('quantity')), unitPrice = Number(String(get('unitPrice')).replaceAll(',', ''));
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) throw Error('Report contains invalid quantities or prices. No orders were imported.');
    const product = String(get('product')), sku = String(get('sku')), variation = String(get('variation'));
    const lineKey = createHash('sha256').update(JSON.stringify([orderId, product, sku, variation])).digest('hex').slice(0, 24);
    const unitPriceCents = Math.round(unitPrice * 100), line = { lineKey, product, sku, parentSku: String(get('parentSku')), variation, quantity, unitPriceCents, lineSubtotalCents: unitPriceCents * quantity };
    const total = String(get('orderTotal')).replaceAll(',', '');
    if (total !== '' && (!Number.isFinite(Number(total)) || Number(total) < 0)) throw Error('Invalid order total.');
    if (!orders.has(orderId)) orders.set(orderId, { orderId, status: String(get('status')), createdAt: get('createdAt'), paidAt: get('paidAt'), currency: 'THB', orderTotalCents: total === '' ? null : Math.round(Number(total) * 100), items: [] });
    const order = orders.get(orderId), existing = order.items.find(item => item.lineKey === lineKey);
    if (existing) { if (existing.unitPriceCents !== unitPriceCents) throw Error('Conflicting prices for the same order item.'); existing.quantity += quantity; existing.lineSubtotalCents += line.lineSubtotalCents; }
    else order.items.push(line);
  }
  return [...orders.values()];
}
async function collect() {
  if (busy) { const e = Error('Another browser operation is running.'); e.status = 409; throw e; }
  busy = true; state.lastRun = new Date().toISOString();
  try {
    await browser(); await page.goto(ORDER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const exports = page.getByRole('button', { name: /^Export$|^ส่งออก$/i });
    try { await exports.first().waitFor({ state: 'visible', timeout: 30000 }); }
    catch { await authStep(); const e = Error(state.message); e.status = 409; throw e; }
    await exports.first().click();
    await page.getByText(/Export All Orders|ส่งออก.*ที่ต้องจัดส่ง/i).waitFor({ timeout: 15000 });
    const range = (await page.locator('body').innerText()).match(/\d{4}\/\d{2}\/\d{2}\s*[–-]\s*\d{4}\/\d{2}\/\d{2}/)?.[0] ?? 'Shopee default date range';
    await exports.last().click();
    const downloadButton = page.getByRole('button', { name: /^Download$|^ดาวน์โหลด$/i });
    await downloadButton.first().waitFor({ state: 'visible', timeout: 120000 });
    const event = page.waitForEvent('download', { timeout: 90000 }); await downloadButton.first().click();
    const download = await event; const filename = download.suggestedFilename();
    if (!filename.toLowerCase().endsWith('.xlsx')) throw Error('Shopee returned an unexpected file type.');
    const reportPath = `${ROOT}/latest-report.xlsx`; await download.saveAs(reportPath); await chmod(reportPath, 0o600);
    const orders = (await normalizeReport(await readFile(reportPath))).map(order => ({...order,status:orderStatus(order.status)})).filter(order => order.status);
    const result = { schemaVersion: 1, source: 'shopee-seller-centre', shop: 'nslabs', scope: 'three_statuses', dateRange: range, collectedAt: new Date().toISOString(), reportName: filename, orderCount: orders.length, itemCount: orders.reduce((n, o) => n + o.items.length, 0), orders, erpImported: false };
    await writeFile(`${ROOT}/latest-orders.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
    await publishFile('latest-orders.json', result);
    state.status = 'connected'; state.message = 'Order report collected and published to ERP.'; state.lastSuccess = result.collectedAt;
    return result;
  } catch (error) { if (state.status !== 'login_required' && state.status !== 'verification_required') { state.status = 'error'; state.message = 'Order collection failed. Review the session before retrying.'; } await page?.screenshot({ path: `${ROOT}/session.png` }).catch(() => {}); throw error; }
  finally { busy = false; await saveState(); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return response(res, 200, { ok: true });
    if (req.method === 'GET' && req.url === '/status') return response(res, 200, { ...state, busy });
    if (req.method === 'POST' && req.url === '/collect') return response(res, 200, await collect());
    if (req.method === 'GET' && req.url === '/orders/latest') { try { return response(res, 200, JSON.parse(await readFile(`${ROOT}/latest-orders.json`, 'utf8'))); } catch { return response(res, 404, { error: 'No report has been collected yet.' }); } }
    // Login is available only inside this container, via docker exec. Credentials are never written to disk.
    if (req.method === 'POST' && req.url === '/session/login' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      if (busy) return response(res, 409, { error: 'Browser busy.' });
      const { email, password } = await body(req);
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return response(res, 400, { error: 'Email and password required.' });
      void login(email, password); return response(res, 202, { status: 'login_started', message: 'Check /status for verification requirements.' });
    }
    return response(res, 404, { error: 'Not found.' });
  } catch (error) { return response(res, error.status || 502, { error: error.message }); }
});
server.requestTimeout = 300000;
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  const timer = setTimeout(() => process.exit(1), 8000); timer.unref();
  server.close();
  await context?.close().catch(() => {});
  process.exit(0);
}
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
server.listen(3020, '0.0.0.0');
await browser();
