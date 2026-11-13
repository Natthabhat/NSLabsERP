export function summarizeShopee(report,now=new Date()) {
  if(!report.snapshot)return null;
  const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(now);
  const currentMonth=`${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`;
  const orders=report.snapshot.orders, counts={'To ship':0,Shipped:0,Complete:0}, monthly=new Map();
  let paymentsCents=0,missingPayments=0,monthOrders=0,monthPaymentsCents=0,units=0,overseasOrders=0,monthOverseasCents=0;
  // Totals are in THB; overseas (SIP) orders use their converted amount. Stored history before regions is THB.
  const thb=order=>order.thbTotalCents!==undefined?order.thbTotalCents:(!order.currency||order.currency==='THB'?order.orderTotalCents:null);
  for(const order of orders) {
    const amount=thb(order), overseas=(order.region||'th')!=='th';
    if(overseas)overseasOrders++;
    if(order.status in counts)counts[order.status]++;
    units+=order.items.reduce((n,item)=>n+item.quantity,0);
    if(amount===null)missingPayments++;else paymentsCents+=amount;
    const month=/^\d{4}-\d{2}/.exec(order.createdAt||'')?.[0];
    if(month){const row=monthly.get(month)||{month,orders:0,paymentsCents:0,missingPayments:0};row.orders++;row.paymentsCents+=amount??0;if(amount===null)row.missingPayments++;monthly.set(month,row);}
    if(month===currentMonth){monthOrders++;monthPaymentsCents+=amount??0;if(overseas)monthOverseasCents+=amount??0;}
  }
  const recent=[...orders].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||b.orderId.localeCompare(a.orderId)).slice(0,5).map(o=>({orderId:o.orderId,createdAt:o.createdAt,status:o.status,product:o.items[0]?.product||'',sku:o.items[0]?.sku||'',lines:o.items.length,units:o.items.reduce((n,i)=>n+i.quantity,0),paymentCents:thb(o),region:o.region||'th',currency:o.currency||'THB',nativeCents:o.orderTotalCents}));
  return {counts,overseasOrders,monthOverseasCents,orderCount:orders.length,units,paymentsCents,missingPayments,monthOrders,monthPaymentsCents,currentMonth,lastCollectedAt:report.snapshot.collectedAt,collectorStatus:report.collector?.status||null,monthly:[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-6),recent};
}
