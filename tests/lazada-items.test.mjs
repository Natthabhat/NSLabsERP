import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLazadaItems,loadLazadaItems,lazadaItemImage} from '../lib/lazada-items.mjs';
test('Lazada item batches join by order ID, deduplicate unit IDs and group identical variants',()=>{
 const item={order_item_id:1,name:'Cable organiser',sku:'N003B',variation:'Black',item_price:'59',product_main_image:'http://th-live.slatic.net/p/image.jpg',status:'delivered',buyer_phone:'private'};
 const data=[{order_id:'123',order_items:[item,{...item,order_item_id:2},{...item},{...item,order_item_id:3,sku:'N003W',variation:'White'}]},{order_id:'999',order_items:[item]}];
 const rows=normalizeLazadaItems(data,['123']).get('123');assert.equal(rows.length,2);assert.equal(rows[0].quantity,2);assert.equal(rows[1].quantity,1);assert.equal(rows[0].thumbnail,'https://th-live.slatic.net/p/image.jpg');assert(!JSON.stringify(rows).includes('private'));
 assert.equal(normalizeLazadaItems([{...item,order_id:'123',quantity:3}],['123']).get('123')[0].quantity,3);
 assert.equal(normalizeLazadaItems([{...item,order_id:'123',quantity:0}],['123']).has('123'),false);
 const mixed=normalizeLazadaItems([{...item,order_id:'123',quantity:0},{...item,order_id:'456',quantity:2}],['123','456']);assert.equal(mixed.has('123'),false);assert.equal(mixed.get('456')[0].quantity,2);
 assert.equal(lazadaItemImage('javascript:alert(1)'),null);assert.equal(lazadaItemImage('https://slatic.net.evil.example/a'),null);
});
test('Lazada item calls use batches of at most 50 and preserve orders if a batch fails',async()=>{
 const orders=Array.from({length:51},(_,i)=>({orderId:String(i+1)})),calls=[];
 const result=await loadLazadaItems(orders,async(path,params)=>{const ids=JSON.parse(params.order_ids);calls.push({path,ids});if(ids[0]===51)throw Error('Unavailable');return {data:ids.map(id=>({order_id:id,order_items:[{order_item_id:id,name:'Product',sku:'SKU'}]}))};});
 assert.deepEqual(calls.map(c=>c.ids.length),[50,1]);assert(calls.every(c=>c.path==='/orders/items/get'));assert.equal(result.orders.length,51);assert.equal(result.orders[0].items[0].product,'Product');assert.equal(result.orders[50].itemsAvailable,false);assert(result.itemWarning);
 const empty=await loadLazadaItems([],()=>{throw Error('Must not request empty batches');});assert.equal(empty.itemWarning,null);
});
