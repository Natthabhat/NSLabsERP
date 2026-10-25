import test from 'node:test';
import assert from 'node:assert/strict';
import { matchShopeeProducts } from '../lib/shopee-products.mjs';
function report() { return {snapshot:{orderCount:1,orders:[{orderId:'ORDER',orderTotalCents:1200,items:[' parent ','SUB-GREY','sub-white','UNKNOWN',''].map((sku,i)=>({lineKey:String(i),sku,product:'Original Shopee name',quantity:1}))}]}}; }
test('main SKU and every variant sub-SKU resolve to the same parent picture without filtering any order items',async()=>{
 const original=report();let query;
 const result=await matchShopeeProducts(original,{query:async(sql,args)=>{query={sql,args};return{rows:['PARENT','SUB-GREY','SUB-WHITE'].map(matchedSku=>({matchedSku,id:'product-id',version:3,name:'Catalogue name',hasPicture:true}))};}});
 assert.deepEqual(query.args,[['PARENT','SUB-GREY','SUB-WHITE','UNKNOWN']]);assert(query.sql.includes('product_variants'));assert(query.sql.includes('ANY($1'));
 const items=result.snapshot.orders[0].items;
 assert.equal(items.length,5);for(const item of items.slice(0,3)){assert.equal(item.catalogueProduct.thumbnail,'/api/products/product-id/image?v=3');assert.equal(item.product,'Original Shopee name');}
 assert.equal(items[3].catalogueProduct,null);assert.equal(items[4].catalogueProduct,null);assert.equal(result.snapshot.orderCount,1);assert.equal(result.snapshot.orders[0].orderTotalCents,1200);
 assert.equal(original.snapshot.orders[0].items[0].catalogueProduct,undefined);
});
test('catalogue outage preserves the full report, including unmatched orders',async()=>{
 const original=report();const result=await matchShopeeProducts(original,{query:async()=>{throw Error('private database detail');}});
 assert.deepEqual(result.snapshot,original.snapshot);assert(result.catalogueWarning);assert(!JSON.stringify(result).includes('private database detail'));
});
test('missing pictures and ambiguous SKUs never use an unrelated image',async()=>{
 const result=await matchShopeeProducts(report(),{query:async()=>({rows:[{matchedSku:'PARENT',id:'one',hasPicture:false},{matchedSku:'SUB-GREY',id:'one',hasPicture:true},{matchedSku:'SUB-GREY',id:'two',hasPicture:true}]})});
 assert.equal(result.snapshot.orders[0].items[0].catalogueProduct.thumbnail,null);assert.equal(result.snapshot.orders[0].items[1].catalogueProduct,null);
});
test('empty reports and missing SKUs do not query the catalogue',async()=>{
 const pool={query:()=>{throw Error('No lookup expected');}};
 const empty={snapshot:null};assert.equal(await matchShopeeProducts(empty,pool),empty);
 const noSku={snapshot:{orders:[{items:[{sku:''}]}]}};assert.equal(await matchShopeeProducts(noSku,pool),noSku);
});
