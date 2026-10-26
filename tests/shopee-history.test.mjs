import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveShopeeSnapshot} from '../lib/shopee-history.mjs';
const snapshot={collectedAt:'2026-10-26T01:00:00.000Z',orders:[{orderId:'ORDER',status:'Shipped',items:[]}]};
function pool({seen=false,previous=[],fail=false}={}) {const calls=[];let released=false;return {calls,get released(){return released;},async connect(){return{async query(sql,args){calls.push({sql,args});if(sql.includes('SELECT 1 FROM'))return{rowCount:seen?1:0};if(sql.startsWith('SELECT order_id'))return{rows:previous};if(fail&&sql.includes('INSERT INTO erp_web.shopee_orders'))throw Error('write failed');return{rows:[]};},release(){released=true;}};}};}
test('status transition stores one order update and an observed transition in one transaction',async()=>{
 const db=pool({previous:[{order_id:'ORDER',status:'To ship',last_seen:'2026-10-25T01:00:00Z'}]});await archiveShopeeSnapshot(snapshot,db);
 const event=db.calls.find(c=>c.sql.includes('INSERT INTO erp_web.shopee_status_events'));
 assert.deepEqual(JSON.parse(event.args[0]),[{orderId:'ORDER',from:'To ship',to:'Shipped'}]);assert.equal(event.args[1],snapshot.collectedAt);assert(db.calls.some(c=>c.sql==='COMMIT'));assert(db.released);
});
test('repeated exports, unchanged status and stale exports do not create duplicate history',async()=>{
 const repeated=pool({seen:true});await archiveShopeeSnapshot(snapshot,repeated);assert(!repeated.calls.some(c=>c.sql.includes('INSERT INTO')));
 const same=pool({previous:[{order_id:'ORDER',status:'Shipped',last_seen:'2026-10-25T01:00:00Z'}]});await archiveShopeeSnapshot(snapshot,same);assert(!same.calls.some(c=>c.sql.includes('INSERT INTO erp_web.shopee_status_events')));
 const stale=pool({previous:[{order_id:'ORDER',status:'Complete',last_seen:'2026-10-27T01:00:00Z'}]});await archiveShopeeSnapshot(snapshot,stale);assert(!stale.calls.some(c=>c.sql.includes('INSERT INTO erp_web.shopee_orders')));
});
test('empty newer report retains stored completed orders and failed writes roll back',async()=>{
 const db=pool();await archiveShopeeSnapshot({...snapshot,orders:[]},db);assert(!db.calls.some(c=>/DELETE|UPDATE/.test(c.sql)));
 const failed=pool({fail:true});await assert.rejects(archiveShopeeSnapshot(snapshot,failed),/write failed/);assert(failed.calls.some(c=>c.sql==='ROLLBACK'));assert(!failed.calls.some(c=>c.sql==='COMMIT'));assert(failed.released);
});
