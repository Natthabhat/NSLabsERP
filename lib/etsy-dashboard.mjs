import {summarizeShopee} from './shopee-dashboard.mjs';
// Etsy amounts are in the shop currency; dashboard totals use each order's THB equivalent.
export function summarizeEtsy(report,now=new Date()) {
 const orders=report.orders.filter(o=>o.status).map(o=>({...o,items:o.items||[],region:undefined}));
 return {...summarizeShopee({snapshot:{orders,collectedAt:report.checkedAt}},now),currency:orders[0]?.currency||null};
}
