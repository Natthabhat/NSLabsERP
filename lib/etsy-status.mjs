export const ETSY_ORDER_STATUSES = ['To ship', 'Shipped', 'Complete'];
// Cancelled, refunded and unpaid receipts are hidden, like cancelled Shopee and Lazada orders.
export function etsyOrderStatus(order) {
  if (!order || ['canceled', 'fully refunded', 'open', 'payment processing'].includes(order.etsyStatus) || !order.paid) return null;
  if (order.delivered) return 'Complete';
  return order.shipped ? 'Shipped' : 'To ship';
}
