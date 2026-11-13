export const EBAY_ORDER_STATUSES = ['To ship', 'Shipped', 'Complete'];
const DAY = 86400000;
// eBay reports fulfilment but not delivery: shipped orders count as Complete 30 days after the sale,
// roughly the end of eBay's usual return window. Cancelled, fully refunded and unpaid orders are hidden.
export function ebayOrderStatus(order, now = Date.now()) {
  if (!order || order.cancelState === 'CANCELED' || ['FULLY_REFUNDED', 'FAILED', 'PENDING'].includes(order.paymentStatus)) return null;
  if (order.fulfillmentStatus !== 'FULFILLED') return 'To ship';
  const created = Date.parse(order.createdAt);
  return Number.isFinite(created) && now - created >= 30 * DAY ? 'Complete' : 'Shipped';
}
