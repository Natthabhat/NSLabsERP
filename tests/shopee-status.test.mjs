import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStatus,ORDER_STATUSES } from '../lib/shopee-status.mjs';
test('only three order statuses are displayed, with shipped distinct from to ship',()=>{
 assert.deepEqual(ORDER_STATUSES,['To ship','Shipped','Complete']);
 for(const status of ['To Ship','ที่ต้องจัดส่ง','เตรียมจัดส่ง'])assert.equal(orderStatus(status),'To ship');
 for(const status of ['Shipped','Shipping','Delivered','กำลังจัดส่ง','จัดส่งแล้ว'])assert.equal(orderStatus(status),'Shipped');
 for(const status of ['Completed','Order Received','สำเร็จแล้ว'])assert.equal(orderStatus(status),'Complete');
 for(const status of ['Cancelled','Unpaid','Return/Refund','คืนสินค้า','ยกเลิก','Unknown',''])assert.equal(orderStatus(status),null);
});
