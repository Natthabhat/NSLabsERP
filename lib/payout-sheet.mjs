import { database } from './database.mjs';

// Adds eBay and Etsy payouts read from the platforms' APIs to the payouts sheet (public.platform_payouts, shown
// under Marketplaces) when no sheet row records them yet. Each added row gets the platform's next code
// ("Etsy 15"), the payout date, a THB estimate at the ECB rate for that day, and is unconfirmed: the amount that
// reached the bank is corrected and confirmed by hand. erp_web.payout_sheet_links records which payout each row
// covers, including existing hand-entered rows ('matched'), so a payout is never added twice.
const SOURCES = [
  { platform: 'Ebay', sql: "SELECT payload FROM erp_web.ebay_payouts WHERE status='SUCCEEDED'" },
  { platform: 'Etsy', sql: 'SELECT payload FROM erp_web.etsy_payouts' },
];
export function nextPayoutCode(platform, codes) {
  const numbers = codes.map(c => Number(/(\d+)\s*$/.exec(String(c))?.[1])).filter(Number.isSafeInteger);
  return `${platform} ${numbers.length ? Math.max(...numbers) + 1 : 1}`;
}
export function planPayoutRows(payouts, linked, codes) {
  const plan = [], taken = { ...codes };
  for (const p of [...payouts].sort((a, b) => String(a.payoutDate).localeCompare(String(b.payoutDate)) || a.payoutId.localeCompare(b.payoutId))) {
    if (linked.has(`${p.platform}|${p.payoutId}`) || p.thbAmountCents == null || !p.payoutDate) continue;
    const code = nextPayoutCode(p.platform, taken[p.platform] || []);
    (taken[p.platform] ||= []).push(code);
    plan.push({ platform: p.platform, payoutId: p.payoutId, code, date: p.payoutDate.slice(0, 10), amountThb: Math.round(p.thbAmountCents) / 100, currency: p.currency, amount: p.amountCents / 100 });
  }
  return plan;
}
export async function addPayoutRows({ pool = database(), dryRun = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('payout-sheet',0))");
    const enabled = (await client.query('SELECT enabled FROM erp_web.payout_sheet_settings WHERE id=true')).rows[0]?.enabled;
    if (!enabled && !dryRun) { await client.query('ROLLBACK'); return { enabled: false, added: [] }; }
    const payouts = [];
    for (const s of SOURCES) for (const { payload } of (await client.query(s.sql)).rows) payouts.push({ ...payload, platform: s.platform });
    const linked = new Set((await client.query('SELECT platform,payout_id FROM erp_web.payout_sheet_links')).rows.map(r => `${r.platform}|${r.payout_id}`));
    const codes = {};
    for (const r of (await client.query("SELECT platform::text AS platform,payout_code FROM public.platform_payouts WHERE platform IN ('Ebay','Etsy')")).rows) (codes[r.platform] ||= []).push(r.payout_code);
    const plan = planPayoutRows(payouts, linked, codes);
    if (dryRun) { await client.query('ROLLBACK'); return { enabled: !!enabled, added: plan }; }
    for (const row of plan) {
      row.sheetId = (await client.query('INSERT INTO public.platform_payouts(payout_code,platform,payout_date,amount_thb,is_confirmed) VALUES($1,$2::payout_platform,$3,$4,false) RETURNING id', [row.code, row.platform, row.date, row.amountThb])).rows[0].id;
      await client.query("INSERT INTO erp_web.payout_sheet_links(platform,payout_id,sheet_id,basis) VALUES($1,$2,$3,'auto')", [row.platform, row.payoutId, row.sheetId]);
    }
    await client.query('COMMIT');
    return { enabled: true, added: plan };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
