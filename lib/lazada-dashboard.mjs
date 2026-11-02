import {summarizeShopee} from './shopee-dashboard.mjs';
import {lazadaOrderStatus} from './lazada-status.mjs';
export function summarizeLazada(report,now=new Date()) {
 const orders=report.orders.flatMap(order=>{
  const status=lazadaOrderStatus(order.statuses);if(!status)return [];
  const value=String(order.price??'').trim(),amount=Number(value);
  return [{...order,status,items:order.items||[],orderTotalCents:value&&Number.isFinite(amount)&&amount>=0?Math.round(amount*100):null}];
 });
 return summarizeShopee({snapshot:{orders,collectedAt:report.checkedAt}},now);
}
