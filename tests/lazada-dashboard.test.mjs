import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLazada} from '../lib/lazada-dashboard.mjs';
test('Lazada overview uses saved active orders, units and exact payment cents',()=>{
 const result=summarizeLazada({checkedAt:'2026-11-01T00:00:00Z',orders:[
 {orderId:'1',statuses:['delivered'],createdAt:'2026-11-01',price:'59.50',items:[{product:'Cable',quantity:2}]},
 {orderId:'2',statuses:['pending'],createdAt:'2025-06-01',price:'',items:[]},
 {orderId:'3',statuses:['canceled'],price:'100',items:[]}
 ]},new Date('2026-11-02T00:00:00Z'));
 assert.equal(result.orderCount,2);assert.equal(result.counts.Complete,1);assert.equal(result.counts['To ship'],1);
 assert.equal(result.paymentsCents,5950);assert.equal(result.missingPayments,1);assert.equal(result.units,2);
 assert.equal(result.monthOrders,1);assert.equal(result.monthPaymentsCents,5950);assert.equal(result.recent[0].product,'Cable');
});
