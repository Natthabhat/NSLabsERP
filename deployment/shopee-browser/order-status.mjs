export const ORDER_STATUSES = ['To ship', 'Shipped', 'Complete'];
export function orderStatus(value) {
  const status=String(value??'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  // Shopee appends a return-window notice to its "Order Received" export status.
  if (status.startsWith('ผู้ซื้อได้รับสินค้าแล้ว โปรดทราบ') || status.startsWith('order received ')) return 'Complete';
  if (/cancel|refund|return|unpaid|ยกเลิก|คืนเงิน|คืนสินค้า|ยังไม่ชำระ|รอการชำระ/.test(status)) return null;
  if (/^(complete|completed|order received|สำเร็จ|สำเร็จแล้ว|เสร็จสิ้น|คำสั่งซื้อเสร็จสิ้น)$/.test(status)) return 'Complete';
  if (/^(shipped|shipping|in transit|delivered|การจัดส่ง|กำลังจัดส่ง|จัดส่งแล้ว|ที่ต้องได้รับ|ได้รับสินค้าแล้ว|จัดส่งสำเร็จ|จัดส่งสำเร็จแล้ว)$/.test(status)) return 'Shipped';
  if (/^(to ship|ready to ship|unshipped|to process|processed|ที่ต้องจัดส่ง|รอการจัดส่ง|รอจัดส่ง|เตรียมจัดส่ง|กำลังเตรียมสินค้า)$/.test(status)) return 'To ship';
  return null;
}
