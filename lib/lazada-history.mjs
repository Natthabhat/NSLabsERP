import {database} from './database.mjs';
import {lazadaOrderStatus} from './lazada-status.mjs';
import {loadLazadaItems} from './lazada-items.mjs';
import {AppError} from './security.mjs';

export function normalizeLazadaOrders(rows) {
 if(!Array.isArray(rows))throw Error('Unexpected Lazada order list');
 return rows.map(o=>{
  const orderId=String(o.order_id??'');if(!/^\d{1,30}$/.test(orderId))throw Error('Invalid Lazada order ID');
  const updated=Date.parse(o.updated_at);
  return {orderId,createdAt:String(o.created_at||''),updatedAt:Number.isFinite(updated)?new Date(updated).toISOString():null,statuses:Array.isArray(o.statuses)?o.statuses.map(s=>String(s).slice(0,60)):[],itemsCount:Number(o.items_count)||0,price:String(o.price??''),currency:'THB'};
 });
}
export function advanceLazadaCursor(cursor,count,total) {
 const [window,...rest]=cursor;
 if(Number.isFinite(total)&&total>5000){
  const after=Date.parse(window.after),before=Date.parse(window.before),middle=Math.floor((after+before)/2);
  if(before-after<2000)throw Error('Too many Lazada orders in a single time interval. Import needs attention.');
  return [{after:window.after,before:new Date(middle).toISOString(),offset:0},{after:new Date(middle).toISOString(),before:window.before,offset:0},...rest];
 }
 if(count<100||(Number.isFinite(total)&&window.offset+count>=total))return rest;
 if(window.offset+count>5000)throw Error('Lazada pagination limit reached before the full history was read.');
 return [{...window,offset:window.offset+count},...rest];
}
export async function fetchLazadaHistoryPage(window,request,mode='created') {
 const response=await request('/orders/get',{[mode+'_after']:window.after,[mode+'_before']:window.before,limit:'100',offset:String(window.offset),sort_by:mode==='created'?'created_at':'updated_at',sort_direction:'ASC'});
 const rows=response.data?.orders;
 const orders=normalizeLazadaOrders(rows),rawTotal=response.data?.countTotal;
 const total=rawTotal===undefined?null:Number(rawTotal);
 if(total!==null&&(!Number.isSafeInteger(total)||total<0))throw Error('Invalid Lazada order count');
 if(!orders.length&&total>window.offset)throw Error('Lazada returned an incomplete history page');
 // Split oversized windows before loading item details; no order is skipped at boundaries.
 if(total>5000)return {orders:[],count:rows.length,total};
 const details=await loadLazadaItems(orders,request);
 return {...details,count:rows.length,total};
}
export async function importLazadaHistory(accessFactory,readerFactory,pool=database()) {
 const guard=await pool.connect();let sellerId;
 try {
  const lock=await guard.query("SELECT pg_try_advisory_lock(hashtextextended('lazada-history-import',0)) AS acquired");
  if(!lock.rows[0].acquired)throw Error('A Lazada history import is already running');
  const access=await accessFactory();sellerId=access.sellerId;
  const before=new Date().toISOString(),after='2010-01-01T00:00:00.000Z';
  await guard.query(`INSERT INTO erp_web.lazada_sync_state(seller_id,cursor,import_after,import_before) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[sellerId,JSON.stringify([{after,before,offset:0}]),after,before]);
  const state=(await guard.query('SELECT * FROM erp_web.lazada_sync_state WHERE seller_id=$1',[sellerId])).rows[0];
  if(state.import_status==='complete')return readLazadaHistory(sellerId,pool);
  await guard.query("UPDATE erp_web.lazada_sync_state SET import_status='running',error=NULL,updated_at=now() WHERE seller_id=$1",[sellerId]);
  let cursor=state.cursor;
  while(cursor.length){
   const current=await accessFactory();if(current.sellerId!==sellerId)throw Error('Lazada shop changed during import');
   const page=await fetchLazadaHistoryPage(cursor[0],readerFactory(current));
   if(page.itemWarning)throw Error('Some Lazada item details were unavailable. Retry the import to resume this page.');
   const next=advanceLazadaCursor(cursor,page.count,page.total);
   await guard.query('BEGIN');
   try {
    await guard.query("SELECT pg_advisory_xact_lock(hashtextextended('lazada-saved-orders',0))");
    await writeLazadaOrders(guard,sellerId,page.orders,new Date().toISOString());
    await guard.query('UPDATE erp_web.lazada_sync_state SET cursor=$2,expected_count=COALESCE(expected_count,$3),updated_at=now() WHERE seller_id=$1',[sellerId,JSON.stringify(next),page.total]);
    await guard.query('COMMIT');cursor=next;
   }catch(error){await guard.query('ROLLBACK');throw error;}
  }
  await guard.query("UPDATE erp_web.lazada_sync_state SET import_status='complete',last_sync_at=import_before,error=NULL,updated_at=now() WHERE seller_id=$1",[sellerId]);
  return readLazadaHistory(sellerId,pool);
 }catch(error){
  if(sellerId)await guard.query("UPDATE erp_web.lazada_sync_state SET import_status='error',error=$2,updated_at=now() WHERE seller_id=$1",[sellerId,error.status?error.message:'The history import stopped. Retry to resume from the last saved page.']).catch(()=>{});
  throw error;
 }finally{await guard.query("SELECT pg_advisory_unlock(hashtextextended('lazada-history-import',0))").catch(()=>{});guard.release();}
}
export async function writeLazadaOrders(client,sellerId,orders,observedAt) {
 if(!sellerId)throw Error('A Lazada seller ID is required');
 if(!orders.length)return;
 const previous=(await client.query('SELECT order_id,payload,source_updated_at FROM erp_web.lazada_orders WHERE seller_id=$1 AND order_id=ANY($2::text[]) FOR UPDATE',[sellerId,orders.map(o=>o.orderId)])).rows;
 const old=new Map(previous.map(o=>[o.order_id,o]));
 const changes=orders.filter(o=>!old.get(o.orderId)?.source_updated_at||o.updatedAt&&Date.parse(o.updatedAt)>=Date.parse(old.get(o.orderId).source_updated_at));
 for(const order of changes){
  const prior=old.get(order.orderId);
  // Keep previously loaded items if a temporary item API outage occurs on refresh.
  const payload=!order.itemsAvailable&&prior?.payload.itemsAvailable?{...order,items:prior.payload.items,itemsAvailable:true}:order;
  await client.query(`INSERT INTO erp_web.lazada_orders(seller_id,order_id,status,payload,source_updated_at,last_seen) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(seller_id,order_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,source_updated_at=excluded.source_updated_at,last_seen=excluded.last_seen`,[sellerId,order.orderId,lazadaOrderStatus(order.statuses),payload,order.updatedAt,observedAt]);
  if(!prior||JSON.stringify(prior.payload.statuses)!==JSON.stringify(order.statuses))await client.query('INSERT INTO erp_web.lazada_status_events(seller_id,order_id,from_statuses,to_statuses,observed_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[sellerId,order.orderId,prior?JSON.stringify(prior.payload.statuses):null,JSON.stringify(order.statuses),observedAt]);
 }
}
export async function readLazadaHistory(sellerId,pool=database()) {
 const rows=await pool.query("SELECT payload,last_seen FROM erp_web.lazada_orders WHERE seller_id=$1 ORDER BY payload->>'createdAt' DESC,order_id DESC",[sellerId]);
 const state=(await pool.query('SELECT import_status,import_after,import_before,expected_count,last_sync_at,error FROM erp_web.lazada_sync_state WHERE seller_id=$1',[sellerId])).rows[0];
 return {orders:rows.rows.map(r=>r.payload),historyStored:true,importing:!state||['pending','running'].includes(state.import_status),importStatus:state?.import_status||'pending',importError:state?.error||null,storedCount:rows.rowCount,checkedAt:state?.last_sync_at?new Date(state.last_sync_at).toISOString():rows.rows[0]?.last_seen?new Date(rows.rows[0].last_seen).toISOString():null};
}
export async function syncLazadaChanges(sellerId,request,pool=database()) {
 const state=(await pool.query('SELECT import_status,last_sync_at FROM erp_web.lazada_sync_state WHERE seller_id=$1',[sellerId])).rows[0];
 if(state?.import_status!=='complete')return readLazadaHistory(sellerId,pool);
 const end=new Date().toISOString(),after=new Date(Date.parse(state.last_sync_at)-5*60000).toISOString();
 let cursor=[{after,before:end,offset:0}];
 while(cursor.length){
  const page=await fetchLazadaHistoryPage(cursor[0],request,'update');
  if(page.itemWarning)throw new AppError('Some product details are unavailable. Refresh again shortly to complete the update.',400);
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lazada-saved-orders',0))");await writeLazadaOrders(client,sellerId,page.orders,new Date().toISOString());await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  cursor=advanceLazadaCursor(cursor,page.count,page.total);
 }
 await pool.query('UPDATE erp_web.lazada_sync_state SET last_sync_at=GREATEST(last_sync_at,$2::timestamptz),updated_at=now() WHERE seller_id=$1',[sellerId,end]);
 return readLazadaHistory(sellerId,pool);
}
