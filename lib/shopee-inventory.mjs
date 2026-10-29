import { database } from './database.mjs';

const sku = value => typeof value==='string' ? value.trim().toUpperCase() : '';
export function orderCreatedAt(value) {
  if(typeof value!=='string')return NaN;
  // Shopee exports local Thailand timestamps without an offset.
  const local=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value);
  return Date.parse(local ? value.replace(' ','T')+'+07:00' : value);
}
export function inventoryTarget(item,products) {
  const code=sku(item.sku), parent=sku(item.parentSku);
  const variants=products.flatMap(p=>(p.variants||[]).filter(v=>sku(v.sku)===code).map(v=>({id:p.id,sku:v.sku,variant:true})));
  if(variants.length===1)return variants[0];
  if(variants.length>1)return null;
  // Never guess a variant from its parent or a SKU prefix.
  const matches=products.filter(p=>!(p.variants||[]).length && (sku(p.sku)===code || (!code && sku(p.sku)===parent)));
  return matches.length===1?{id:matches[0].id,sku:matches[0].sku,variant:false}:null;
}

export async function syncShopeeInventory(pool=database()) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shopee-order-history',0))");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('erp-product-skus',0))");
    const settings=await client.query('SELECT enabled_at FROM erp_web.shopee_inventory_settings WHERE id=true');
    if(!settings.rows.length){await client.query('COMMIT');return {pending:0};}
    const cutoff=Date.parse(settings.rows[0].enabled_at);
    const orders=(await client.query('SELECT payload FROM erp_web.shopee_orders')).rows.map(r=>r.payload).filter(o=>orderCreatedAt(o.createdAt)>=cutoff);
    const products=(await client.query(`SELECT p.id,p.sku,COALESCE((SELECT jsonb_agg(jsonb_build_object('sku',v.sku)) FROM erp_web.product_variants v WHERE v.product_id=p.id),'[]'::jsonb) AS variants FROM erp_web.products p`)).rows;
    const saved=new Map((await client.query('SELECT * FROM erp_web.shopee_inventory_lines')).rows.map(r=>[`${r.order_id}/${r.line_key}`,r]));
    for(const order of orders) {
      const items=new Map(order.items.map(i=>[i.lineKey,i]));
      // Quantity corrections, including removed lines, apply only the difference.
      for(const row of saved.values())if(row.order_id===order.orderId&&!items.has(row.line_key))items.set(row.line_key,{lineKey:row.line_key,quantity:0});
      for(const item of items.values()) {
        if(!Number.isSafeInteger(item.quantity)||item.quantity<0)throw Error('Invalid Shopee stock quantity');
        const old=saved.get(`${order.orderId}/${item.lineKey}`), applied=old?.applied_quantity||0;
        const target=old?.product_id ? products.flatMap(p=>p.id===old.product_id ? (p.variants.length?p.variants.filter(v=>v.sku===old.target_sku).map(v=>({id:p.id,sku:v.sku,variant:true})):p.sku===old.target_sku?[{id:p.id,sku:p.sku,variant:false}]:[]):[])[0] : inventoryTarget(item,products);
        const delta=item.quantity-applied;
        if(!delta&&!old?.issue)continue;
        let issue=null, next=applied;
        if(!target)issue='No exact product or variant SKU match';
        else if(delta) {
          const table=target.variant?'product_variants':'products';
          const result=await client.query(`UPDATE erp_web.${table} SET quantity=quantity-$1${target.variant?'':',version=version+1,updated_at=now()'} WHERE ${target.variant?'product_id':'id'}=$2 AND sku=$3 AND quantity-$1 BETWEEN 0 AND 1000000000 RETURNING quantity`,[delta,target.id,target.sku]);
          if(!result.rowCount)issue='Insufficient stock or product changed';
          else {
            next=item.quantity;
            if(target.variant)await client.query('UPDATE erp_web.products SET version=version+1,updated_at=now() WHERE id=$1',[target.id]);
            await client.query('INSERT INTO erp_web.shopee_stock_movements(order_id,line_key,product_id,sku,quantity_change) VALUES($1,$2,$3,$4,$5)',[order.orderId,item.lineKey,target.id,target.sku,-delta]);
          }
        }
        await client.query(`INSERT INTO erp_web.shopee_inventory_lines(order_id,line_key,product_id,target_sku,applied_quantity,desired_quantity,issue) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(order_id,line_key) DO UPDATE SET product_id=excluded.product_id,target_sku=excluded.target_sku,applied_quantity=excluded.applied_quantity,desired_quantity=excluded.desired_quantity,issue=excluded.issue,updated_at=now()`,[order.orderId,item.lineKey,old?.product_id||target?.id||null,old?.target_sku||target?.sku||null,next,item.quantity,issue]);
      }
    }
    const pending=Number((await client.query('SELECT count(*) AS count FROM erp_web.shopee_inventory_lines WHERE issue IS NOT NULL')).rows[0].count);
    await client.query('COMMIT');return {pending};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
