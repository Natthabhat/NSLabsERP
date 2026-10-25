import { database } from './database.mjs';

const normalizeSku = value => typeof value === 'string' ? value.trim().toUpperCase() : '';

// Enrich the saved report at read time so catalogue edits appear without re-collecting Shopee.
export async function matchShopeeProducts(report, pool = database()) {
  if (!report.snapshot) return report;
  const skus = [...new Set(report.snapshot.orders.flatMap(order => order.items.map(item => normalizeSku(item.sku))).filter(Boolean))];
  if (!skus.length) return report;
  try {
    const result = await pool.query(`SELECT p.id,p.version,p.name,p.sku AS "matchedSku",(p.picture IS NOT NULL) AS "hasPicture"
      FROM erp_web.products p WHERE p.sku=ANY($1::text[])
      UNION ALL
      SELECT p.id,p.version,p.name,v.sku AS "matchedSku",(p.picture IS NOT NULL) AS "hasPicture"
      FROM erp_web.product_variants v JOIN erp_web.products p ON p.id=v.product_id WHERE v.sku=ANY($1::text[])`, [skus]);
    const matches = new Map();
    for (const row of result.rows) {
      const sku = normalizeSku(row.matchedSku), previous = matches.get(sku);
      // An ambiguous catalogue entry must never attach another product's picture.
      if (matches.has(sku) && (!previous || previous.id !== row.id)) matches.set(sku, null);
      else matches.set(sku, row);
    }
    return { ...report, snapshot: { ...report.snapshot, orders: report.snapshot.orders.map(order => ({ ...order, items: order.items.map(item => {
      const product = matches.get(normalizeSku(item.sku));
      return { ...item, catalogueProduct: product ? { id: product.id, name: product.name, thumbnail: product.hasPicture ? `/api/products/${product.id}/image?v=${product.version}` : null } : null };
    }) })) } };
  } catch {
    // Order visibility must not depend on the optional catalogue lookup.
    return { ...report, catalogueWarning: 'Product pictures are temporarily unavailable. All Shopee orders are still shown.' };
  }
}
