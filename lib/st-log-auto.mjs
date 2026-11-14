import { database } from './database.mjs';
import { loadStLogData, assignStLog } from './st-log-links.mjs';

// Adds ST sales log rows for imported platform orders that have none: one row per unit of an ST-model order line
// created on or after `since`. Units already covered by a row entered by hand (paired by product, platform and
// date) or by an earlier automatic row are skipped; erp_web.st_log_auto records every unit it added.
// Price: THB after platform fees where the platform reports fees (eBay, Etsy, Shopee), otherwise the buyer
// payment. Shipping: 700 for eBay and Etsy, 0 for Shopee and Lazada. Buyer is left empty: integrations do not
// store buyer names. Rows are never deleted, also when an order is cancelled later.
const OVERSEAS_SHIPPING = { Ebay: 700, Etsy: 700, Shopee: 0, Lazada: 0 };

export function planStLogRows({ rows, lines }, autoUnits, since) {
  const autoLogIds = new Set(autoUnits.map(a => a.log_id));
  const { remaining } = assignStLog(rows.filter(r => !autoLogIds.has(r.id)), lines);
  const done = new Map();
  for (const a of autoUnits) {
    const key = `${a.platform}|${a.order_id}|${a.line_key}`;
    (done.get(key) || done.set(key, new Set()).get(key)).add(a.unit);
  }
  const plan = [];
  for (const line of remaining) {
    if (!line.left || line.day < since) continue;
    const key = `${line.platform}|${line.orderId}|${line.lineKey}`, used = done.get(key) || new Set();
    let missing = line.left - used.size;
    for (let unit = 1; unit <= line.units && missing > 0; unit++) {
      if (used.has(unit)) continue;
      const afterFees = line.afterFeesThb != null, price = afterFees ? line.afterFeesThb : line.buyerThb;
      if (price == null) break;
      plan.push({ platform: line.platform, orderId: line.orderId, lineKey: line.lineKey, unit, code: line.code, day: line.day, status: line.status,
        price: Math.round(price) / 100, shipping: OVERSEAS_SHIPPING[line.platform] ?? 0, basis: afterFees ? 'after_fees' : 'buyer_payment' });
      missing--;
    }
  }
  return plan.sort((a, b) => a.day.localeCompare(b.day) || a.orderId.localeCompare(b.orderId) || a.unit - b.unit);
}

export async function addStLogRows({ pool = database(), dryRun = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('st-log-auto',0))");
    const settings = (await client.query("SELECT enabled,to_char(since,'YYYY-MM-DD') AS since FROM erp_web.st_log_auto_settings WHERE id=true")).rows[0];
    if (!settings || (!settings.enabled && !dryRun)) { await client.query('ROLLBACK'); return { enabled: false, added: [] }; }
    const autoUnits = (await client.query('SELECT platform,order_id,line_key,unit,log_id FROM erp_web.st_log_auto')).rows;
    const plan = planStLogRows(await loadStLogData(client), autoUnits, settings.since);
    if (dryRun) { await client.query('ROLLBACK'); return { enabled: settings.enabled, since: settings.since, added: plan }; }
    for (const row of plan) {
      const id = (await client.query('INSERT INTO public.st_sales_log(product_code,platform,sale_date,price,shipping,buyer) VALUES($1,$2::sales_platform,$3,$4,$5,NULL) RETURNING id', [row.code, row.platform, row.day, row.price, row.shipping])).rows[0].id;
      await client.query('INSERT INTO erp_web.st_log_auto(platform,order_id,line_key,unit,log_id,price_basis) VALUES($1,$2,$3,$4,$5,$6)', [row.platform, row.orderId, row.lineKey, row.unit, id, row.basis]);
      row.logId = id;
    }
    await client.query('COMMIT');
    return { enabled: true, since: settings.since, added: plan };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
