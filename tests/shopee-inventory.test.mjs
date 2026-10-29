import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {inventoryTarget,orderCreatedAt,syncShopeeInventory} from '../lib/shopee-inventory.mjs';

test('inventory uses exact variant SKU and never guesses a variant from parent/prefix',()=>{
 const products=[{id:'a',sku:'N003',variants:[{sku:'N003B'}]},{id:'b',sku:'N004',variants:[]}];
 assert.deepEqual(inventoryTarget({sku:' n003b '},products),{id:'a',sku:'N003B',variant:true});
 assert.equal(inventoryTarget({sku:'N003X',parentSku:'N003'},products),null);
 assert.equal(inventoryTarget({sku:'N003'},products),null);
 assert.equal(inventoryTarget({sku:'N004X'},products),null);
 assert.equal(inventoryTarget({sku:'N004'},products).id,'b');
 assert.equal(orderCreatedAt('2026-10-29 12:00'),Date.parse('2026-10-29T05:00:00Z'));
 assert(Number.isNaN(orderCreatedAt('unknown')));
});

test('PostgreSQL stock deductions are idempotent, handle corrections and shortages, exclude history and roll back atomically',{skip:!process.env.TEST_SHOPEE_INVENTORY_DATABASE},async()=>{
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try {
  for(const name of ['products','product_variants','shopee_orders','shopee_inventory_settings','shopee_inventory_lines','shopee_stock_movements'])await client.query(`CREATE TEMP TABLE ${name} (LIKE erp_web.${name} INCLUDING ALL)`);
  const pool={async connect(){return {query:(sql,args)=>client.query(sql.replaceAll('erp_web.','pg_temp.'),args),release(){}};}};
  await client.query("INSERT INTO pg_temp.shopee_inventory_settings VALUES(true,'2026-10-29T05:00:00Z')");
  const id=(await client.query("INSERT INTO pg_temp.products(name,sku,quantity) VALUES('Test','P',0) RETURNING id")).rows[0].id;
  await client.query("INSERT INTO pg_temp.product_variants(product_id,name,sku,quantity) VALUES($1,'Black','PB',10)",[id]);
  const order={orderId:'NEW',status:'To ship',createdAt:'2026-10-29 12:01',items:[{lineKey:'L',sku:'PB',quantity:3}]};
  const put=async(o)=>client.query("INSERT INTO pg_temp.shopee_orders VALUES($1,$2,$3,now(),now()) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,payload=excluded.payload",[o.orderId,o.status,o]);
  const stock=async()=>Number((await client.query("SELECT quantity FROM pg_temp.product_variants WHERE sku='PB'")).rows[0].quantity);
  await put({...order,orderId:'OLD',createdAt:'2026-10-29 11:59'});await put(order);
  await syncShopeeInventory(pool);assert.equal(await stock(),7);
  const plain=(await client.query("INSERT INTO pg_temp.products(name,sku,quantity) VALUES('Plain','SINGLE',11) RETURNING id")).rows[0].id;
  await put({...order,orderId:'PLAIN',items:[{lineKey:'P',sku:'SINGLE',quantity:2}]});await syncShopeeInventory(pool);
  assert.equal((await client.query('SELECT quantity FROM pg_temp.products WHERE id=$1',[plain])).rows[0].quantity,9);
  await syncShopeeInventory(pool);assert.equal(await stock(),7);
  order.status='Complete';await put(order);await syncShopeeInventory(pool);assert.equal(await stock(),7);
  order.items[0].quantity=5;await put(order);await syncShopeeInventory(pool);assert.equal(await stock(),5);
  order.items[0].quantity=2;await put(order);await syncShopeeInventory(pool);assert.equal(await stock(),8);
  order.items[0].quantity=20;await put(order);assert.equal((await syncShopeeInventory(pool)).pending,1);assert.equal(await stock(),8);
  await client.query("UPDATE pg_temp.product_variants SET quantity=30 WHERE sku='PB'");await syncShopeeInventory(pool);assert.equal(await stock(),12);
  await syncShopeeInventory(pool);assert.equal(await stock(),12);
  await put({...order,orderId:'BADSKU',items:[{lineKey:'B',sku:'PUNKNOWN',quantity:1}]});assert.equal((await syncShopeeInventory(pool)).pending,1);assert.equal(await stock(),12);
  const version=(await client.query('SELECT version FROM pg_temp.products')).rows[0].version;assert(version>1);
  order.items[0].quantity=21;await put(order);
  const failPool={async connect(){return {query(sql,args){if(sql.includes('INSERT INTO erp_web.shopee_stock_movements'))throw Error('Test failure');return client.query(sql.replaceAll('erp_web.','pg_temp.'),args);},release(){}};}};
  await assert.rejects(syncShopeeInventory(failPool),/Test failure/);assert.equal(await stock(),12);
 }finally{await client.end();}
});
