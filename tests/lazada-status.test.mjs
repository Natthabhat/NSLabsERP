import test from 'node:test';
import assert from 'node:assert/strict';
import {lazadaOrderStatus} from '../lib/lazada-status.mjs';
test('Lazada groups fulfillment into To ship, Shipped and Complete',()=>{
 for(const s of ['pending','packed','repacked','ready_to_ship'])assert.equal(lazadaOrderStatus([s]),'To ship');
 assert.equal(lazadaOrderStatus(['shipped']),'Shipped');
 for(const s of ['delivered','confirmed'])assert.equal(lazadaOrderStatus([s]),'Complete');
 assert.equal(lazadaOrderStatus(['DELIVERED',' confirmed ']),'Complete');
});
test('mixed Lazada orders use earliest active stage and exclude canceled/returned orders',()=>{
 assert.equal(lazadaOrderStatus(['pending','shipped','delivered']),'To ship');
 assert.equal(lazadaOrderStatus(['shipped','confirmed']),'Shipped');
 assert.equal(lazadaOrderStatus(['canceled','delivered']),'Complete');
 for(const s of [[],['canceled'],['returned'],['unpaid'],['unknown','delivered'],null])assert.equal(lazadaOrderStatus(s),null);
});
