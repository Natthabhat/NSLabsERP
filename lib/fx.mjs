// Daily ECB reference rates (frankfurter.app) for showing marketplace amounts in THB.
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
