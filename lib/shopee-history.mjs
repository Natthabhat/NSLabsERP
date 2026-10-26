import { readdir,readFile,stat } from 'node:fs/promises';
import { join } from 'node:path';
import { database } from './database.mjs';
import { readShopeeSnapshot,validateShopeeSnapshot } from './shopee.mjs';

export async function archiveShopeeSnapshot(snapshot,pool=database()) {
  if(!snapshot)return;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shopee-order-history',0))");
    const seen=await client.query('SELECT 1 FROM erp_web.shopee_imports WHERE collected_at=$1',[snapshot.collectedAt]);
    if(seen.rowCount){await client.query('COMMIT');return;}
    const previous=await client.query('SELECT order_id,status,last_seen FROM erp_web.shopee_orders WHERE order_id=ANY($1::text[])',[snapshot.orders.map(o=>o.orderId)]);
    const old=new Map(previous.rows.map(o=>[o.order_id,o]));
    const changes=snapshot.orders.filter(o=>!old.has(o.orderId)||Date.parse(snapshot.collectedAt)>Date.parse(old.get(o.orderId).last_seen));
    if(changes.length) {
      await client.query(`INSERT INTO erp_web.shopee_orders(order_id,status,payload,first_seen,last_seen)
        SELECT value->>'orderId',value->>'status',value,$2::timestamptz,$2::timestamptz FROM jsonb_array_elements($1::jsonb)
        ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,last_seen=excluded.last_seen`,[JSON.stringify(changes),snapshot.collectedAt]);
      const events=changes.filter(o=>old.get(o.orderId)?.status!==o.status).map(o=>({orderId:o.orderId,from:old.get(o.orderId)?.status??null,to:o.status}));
      if(events.length)await client.query(`INSERT INTO erp_web.shopee_status_events(order_id,from_status,to_status,observed_at)
        SELECT value->>'orderId',value->>'from',value->>'to',$2::timestamptz FROM jsonb_array_elements($1::jsonb) ON CONFLICT DO NOTHING`,[JSON.stringify(events),snapshot.collectedAt]);
    }
    await client.query('INSERT INTO erp_web.shopee_imports(collected_at) VALUES($1)',[snapshot.collectedAt]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

let syncing;
export async function syncShopeeHistory() {
  if(syncing)return syncing;
  syncing=(async()=>{
    const directory=process.env.SHOPEE_SNAPSHOT_DIR||'/var/lib/nslabs-shopee';
    let files=[];
    try{files=(await readdir(join(directory,'history'))).filter(f=>/^\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/.test(f)).sort();}catch(e){if(e.code!=='ENOENT')throw e;}
    const imported=new Set((await database().query('SELECT collected_at FROM erp_web.shopee_imports')).rows.map(r=>new Date(r.collected_at).toISOString()));
    for(const file of files){
      // The filename encodes collection time, so already imported files need no disk read.
      const timestamp=file.slice(0,-5).replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,'T$1:$2:$3.$4Z');
      if(imported.has(timestamp))continue;
      const path=join(directory,'history',file);if((await stat(path)).size>20000000)throw Error('Shopee archive file too large');
      await archiveShopeeSnapshot(validateShopeeSnapshot(JSON.parse(await readFile(path,'utf8'))));
    }
    const report=await readShopeeSnapshot();
    await archiveShopeeSnapshot(report.snapshot);
    return report;
  })();
  try{return await syncing;}finally{syncing=undefined;}
}

export async function readShopeeHistory() {
  const report=await syncShopeeHistory();
  const currentIds=(report.snapshot?.orders||[]).filter(o=>o.status!=='Complete').map(o=>o.orderId);
  const result=await database().query(`SELECT p.payload,p.last_seen,
    (SELECT jsonb_agg(jsonb_build_object('from',e.from_status,'to',e.to_status,'observedAt',e.observed_at) ORDER BY e.observed_at) FROM erp_web.shopee_status_events e WHERE e.order_id=p.order_id) AS history
    FROM erp_web.shopee_orders p WHERE p.status='Complete' OR p.order_id=ANY($1::text[]) ORDER BY p.payload->>'createdAt' DESC,p.order_id DESC`,[currentIds]);
  if(!report.snapshot&&!result.rows.length)return report;
  const orders=result.rows.map(r=>({...r.payload,statusHistory:r.history||[]}));
  const metadata=report.snapshot||{source:'Shopee Seller Centre',shop:'nslabs',scope:'three_statuses',dateRange:'Saved order history',collectedAt:new Date(Math.max(...result.rows.map(r=>Date.parse(r.last_seen)))).toISOString()};
  return {...report,available:true,snapshot:{...metadata,orders,orderCount:orders.length,itemCount:orders.reduce((n,o)=>n+o.items.length,0),historyStored:true}};
}
