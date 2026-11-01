export const LAZADA_ORDER_STATUSES=['To ship','Shipped','Complete'];
export function lazadaOrderStatus(statuses) {
  if(!Array.isArray(statuses)||!statuses.length)return null;
  const stages={pending:0,packed:0,repacked:0,ready_to_ship:0,shipped:1,delivered:2,confirmed:2};
  const terminal=new Set(['canceled','cancelled','returned','failed','failed_delivery','lost']);
  const active=statuses.map(s=>String(s).trim().toLowerCase()).filter(s=>!terminal.has(s));
  if(!active.length||active.some(s=>stages[s]===undefined))return null;
  return LAZADA_ORDER_STATUSES[Math.min(...active.map(s=>stages[s]))];
}
