const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
export function lazadaItemImage(value) {
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
    if(!['slatic.net','lazcdn.com','lazada.com'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))return null;
    u.protocol='https:';return u.href;
  }catch{return null;}
}
export function normalizeLazadaItems(data,requestedIds) {
  if(!Array.isArray(data))throw Error('Unexpected Lazada order-items response');
  const requested=new Set(requestedIds),groups=new Map(),seen=new Set();
  for(const entry of data) {
    const rows=Array.isArray(entry?.order_items)?entry.order_items:[entry];
    const groupId=String(entry?.order_id??'');
    if(requested.has(groupId)&&Array.isArray(entry?.order_items)&&!groups.has(groupId))groups.set(groupId,new Map());
    for(const row of rows) {
      const orderId=String(row?.order_id??groupId),id=String(row?.order_item_id??'');
      if(!requested.has(orderId)||!id||seen.has(`${orderId}/${id}`))continue;
      const quantity=row.quantity==null?1:Number(row.quantity);
      if(!Number.isSafeInteger(quantity)||quantity<1)throw Error('Invalid Lazada item quantity');
      seen.add(`${orderId}/${id}`);
      const item={product:text(row.name)||'Unnamed product',sku:text(row.sku,120)||text(row.shop_sku,120),variation:text(row.variation,300),quantity,price:text(String(row.item_price??''),40),thumbnail:lazadaItemImage(row.product_main_image),status:text(row.status,60)};
      const key=JSON.stringify([item.product,item.sku,item.variation,item.price,item.status]);
      if(!groups.has(orderId))groups.set(orderId,new Map());
      const existing=groups.get(orderId).get(key);
      if(existing)existing.quantity+=quantity;
      else groups.get(orderId).set(key,{...item,lineKey:id});
    }
  }
  return new Map([...groups].map(([id,items])=>[id,[...items.values()]]));
}
export async function loadLazadaItems(orders,request) {
  const ids=[...new Set(orders.map(o=>o.orderId).filter(id=>/^\d{1,30}$/.test(id)))],items=new Map();let failed=false;
  for(let index=0;index<ids.length;index+=50) {
    const batch=ids.slice(index,index+50);
    try{
      const response=await request('/orders/items/get',{order_ids:'['+batch.join(',')+']'});
      for(const [id,lines] of normalizeLazadaItems(response.data,batch))items.set(id,lines);
    }catch{failed=true;}
  }
  return {orders:orders.map(order=>({...order,items:items.get(order.orderId)||[],itemsAvailable:items.has(order.orderId)})),itemWarning:failed||ids.some(id=>!items.has(id))?'Some product details could not be loaded. Refresh data to try again.':null};
}
