import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {normalizeLazadaOrders,advanceLazadaCursor,fetchLazadaHistoryPage,writeLazadaOrders,readLazadaHistory} from '../lib/lazada-history.mjs';
const window={after:'2010-01-01T00:00:00.000Z',before:'2026-11-02T00:00:00.000Z',offset:0};
test('Lazada history paging continues beyond 100 orders and splits windows before the 5000 offset limit',()=>{
 assert.equal(advanceLazadaCursor([window],100,240)[0].offset,100);
 assert.equal(advanceLazadaCursor([{...window,offset:200}],40,240).length,0);
 const split=advanceLazadaCursor([window],100,6000);assert.equal(split.length,2);assert.equal(split[0].before,split[1].after);assert.equal(split[1].before,window.before);
 assert.throws(()=>advanceLazadaCursor([{after:window.after,before:'2010-01-01T00:00:01Z',offset:0}],100,6000));
});
test('Lazada history keeps only operational fields and requests explicit date windows',async()=>{
 const raw={order_id:123,created_at:'2025-01-01 12:00:00 +0700',updated_at:'2026-11-01 12:00:00 +0700',statuses:['confirmed'],items_count:2,price:'100',customer_first_name:'PRIVATE',address_shipping:{phone:'PRIVATE'}};
 const rows=normalizeLazadaOrders([raw]);assert(!JSON.stringify(rows).includes('PRIVATE'));assert.equal(rows[0].updatedAt,'2026-11-01T05:00:00.000Z');
 const calls=[];const result=await fetchLazadaHistoryPage(window,async(path,params)=>{calls.push({path,params});return path==='/orders/get'?{data:{countTotal:1,orders:[raw]}}:{data:[{order_id:123,order_items:[{order_item_id:1,name:'Product',sku:'SKU',quantity:2}]}]};});
 assert.equal(calls[0].params.created_after,window.after);assert.equal(calls[0].params.created_before,window.before);assert.equal(calls[0].params.limit,'100');assert.equal(result.orders[0].items[0].quantity,2);
 await assert.rejects(fetchLazadaHistoryPage(window,async()=>({data:{countTotal:10,orders:[]}})),/incomplete/);
});
test('PostgreSQL Lazada history persists once per shop/order, rejects stale updates, retains items and rolls back atomically',{skip:!process.env.TEST_LAZADA_HISTORY_DATABASE},async()=>{
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{
  for(const name of ['lazada_orders','lazada_status_events','lazada_sync_state'])await client.query(`CREATE TEMP TABLE ${name} (LIKE erp_web.${name} INCLUDING ALL)`);
  const db={query:(sql,args)=>client.query(sql.replaceAll('erp_web.','pg_temp.'),args)};
  let order={orderId:'123',createdAt:'2025-01-01 12:00:00 +0700',updatedAt:'2026-11-01T00:00:00Z',statuses:['shipped'],items:[{product:'Test',quantity:2}],itemsAvailable:true};
  const save=async(o,seller='A')=>{await client.query('BEGIN');try{await writeLazadaOrders(db,seller,[o],new Date().toISOString());await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}};
  await save(order);await save(order);assert.equal((await client.query('SELECT count(*) FROM pg_temp.lazada_orders')).rows[0].count,'1');assert.equal((await client.query('SELECT count(*) FROM pg_temp.lazada_status_events')).rows[0].count,'1');
  order={...order,updatedAt:'2026-11-02T00:00:00Z',statuses:['confirmed'],items:[],itemsAvailable:false};await save(order);
  await save({...order,updatedAt:'2026-10-01T00:00:00Z',statuses:['pending']});
  const saved=(await readLazadaHistory('A',db)).orders[0];assert.deepEqual(saved.statuses,['confirmed']);assert.equal(saved.items[0].quantity,2);
  await save(order,'B');assert.equal((await readLazadaHistory('A',db)).orders.length,1);assert.equal((await readLazadaHistory('B',db)).orders.length,1);
  await client.query('BEGIN');const failing={query:(sql,args)=>{if(sql.includes('INSERT INTO erp_web.lazada_status_events'))throw Error('Test failure');return db.query(sql,args);}};
  await assert.rejects(writeLazadaOrders(failing,'A',[{...order,orderId:'456'}],new Date().toISOString()),/Test failure/);await client.query('ROLLBACK');assert.equal((await readLazadaHistory('A',db)).orders.length,1);
 }finally{await client.end();}
});
