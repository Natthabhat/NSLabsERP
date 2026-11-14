// Background refresh of the API marketplaces (Etsy, eBay, Lazada), then automatic ST log rows.
// Shopee is refreshed by its own collector and import loop. A marketplace that is not connected is skipped.
const quiet = error => error?.status === 409 || error?.status === 503 || /first|not connected/i.test(error?.message || '');
async function job(name, work) {
  try { await work(); } catch (error) { if (!quiet(error)) console.error(`${name} background sync failed:`, error?.message || error); }
}
export async function runMarketplaceJobs() {
  await job('Etsy', async () => {
    const { etsyAccess, etsyReader } = await import('./etsy.mjs'), { syncEtsyOrders } = await import('./etsy-orders.mjs');
    const access = await etsyAccess(); await syncEtsyOrders(access, etsyReader(access));
  });
  await job('eBay', async () => {
    const { ebayAccess, ebayReader, ebayItemReader } = await import('./ebay.mjs'), { syncEbay } = await import('./ebay-orders.mjs');
    const access = await ebayAccess(); await syncEbay(access, ebayReader(access), { item: ebayItemReader(access) });
  });
  await job('Lazada', async () => { const { checkLazadaOrders } = await import('./lazada.mjs'); await checkLazadaOrders(); });
  await job('ST log', async () => {
    const { addStLogRows } = await import('./st-log-auto.mjs');
    const result = await addStLogRows();
    if (result.added.length) console.log(`ST log: added ${result.added.length} row(s) from platform orders.`);
  });
}
