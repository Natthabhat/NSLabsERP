import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeShopee} from '../lib/shopee-dashboard.mjs';
test('Shopee dashboard counts each order payment once while summing item quantities',()=>{
 const order=(id,status,createdAt,total,quantity)=>({orderId:id,status,createdAt,orderTotalCents:total,items:[{product:'Product',sku:'SKU',quantity},{product:'Other',quantity:1}]});
 const result=summarizeShopee({snapshot:{collectedAt:'2026-10-28T01:00:00Z',orders:[order('A','To ship','2026-10-28 08:00',5900,2),order('B','Shipped','2026-10-27 12:00',null,1),order('C','Complete','2026-09-01 10:00',10000,3)]}},new Date('2026-10-28T00:00:00Z'));
 assert.deepEqual(result.counts,{'To ship':1,Shipped:1,Complete:1});assert.equal(result.orderCount,3);assert.equal(result.paymentsCents,15900);assert.equal(result.units,9);assert.equal(result.missingPayments,1);assert.equal(result.monthOrders,2);assert.equal(result.monthPaymentsCents,5900);assert.equal(result.currentMonth,'2026-10');assert.equal(result.recent[0].orderId,'A');assert.equal(result.recent[0].paymentCents,5900);
 assert.deepEqual(result.monthly.map(m=>[m.month,m.orders]),[['2026-09',1],['2026-10',2]]);
});
test('month boundaries use Bangkok time and empty or missing history is explicit',()=>{
 assert.equal(summarizeShopee({snapshot:null}),null);
 const result=summarizeShopee({snapshot:{orders:[]}},new Date('2026-10-31T18:00:00Z'));
 assert.equal(result.currentMonth,'2026-11');assert.equal(result.orderCount,0);assert.deepEqual(result.monthly,[]);assert.deepEqual(result.recent,[]);
});
