/** Fictional portal fixtures, deliberately separate from seeded AWS records. */
export const demoCustomer = Object.freeze({ id: 'DEMO-CUSTOMER', name: 'Alex Morgan', email: 'demo@novamart.local', tier: 'Premium' });
export const demoOrders = [
  {
    id: 'DEMO-1042', product: 'Wireless Headphones Pro', category: 'Audio', quantity: 1, price: 149.99,
    status: 'in_transit', placedAt: '2026-10-24', deliveryDate: '2026-10-28',
    trackingNumber: 'DEMO-TRACK-1042', destination: 'Vancouver, BC',
    events: [
      { label: 'Order confirmed', date: 'Oct 24 · 9:42 AM', complete: true },
      { label: 'Packed with care', date: 'Oct 25 · 11:18 AM', complete: true },
      { label: 'On the way', date: 'Oct 26 · 6:30 PM', complete: true },
      { label: 'Delivered', date: 'Estimated Oct 28', complete: false },
    ],
  },
  {
    id: 'DEMO-1038', product: 'Bluetooth Speaker', category: 'Audio', quantity: 1, price: 49.99,
    status: 'delivered', placedAt: '2026-10-18', deliveryDate: '2026-10-22',
    trackingNumber: 'DEMO-TRACK-1038', destination: 'Vancouver, BC',
    events: [
      { label: 'Order confirmed', date: 'Oct 18', complete: true },
      { label: 'Packed with care', date: 'Oct 19', complete: true },
      { label: 'On the way', date: 'Oct 20', complete: true },
      { label: 'Delivered', date: 'Oct 22 · 2:14 PM', complete: true },
    ],
  },
];

export function demoReply(message) {
  const text = message.toLowerCase();
  const orderId = message.match(/(?:DEMO|ORD)-\d+/i)?.[0].toUpperCase();
  const order = demoOrders.find((item) => item.id === orderId);
  if (orderId && !order) return `I couldn't find ${orderId} among your demo orders. Please select one of the orders shown in your account. No real order lookup was performed.`;
  if (/refund|return/.test(text)) return 'In the NovaMart project, the return window is 60 days for Premium customers and 30 days for Standard customers. This local demo cannot evaluate actual eligibility, create a return, or issue a refund. I can help you review a demo order.';
  if (/warranty/.test(text)) return 'For a real warranty decision, NovaMart needs the product details and its verified warranty policy. This demo does not query the Knowledge Bases or verify coverage. You can explore tracking with one of your demo orders.';
  if (/shipping|ship|track|where|deliver|order/.test(text)) {
    const selected = order ?? demoOrders[0];
    return selected.status === 'delivered'
      ? `${selected.product} (${selected.id}) was delivered on October 22 in this sample timeline. Tracking reference: ${selected.trackingNumber}. This is fictional demonstration data.`
      : `${selected.product} (${selected.id}) is on the way to ${selected.destination}. The sample delivery estimate is October 28. It was last marked in transit on October 26 at 6:30 PM. Tracking reference: ${selected.trackingNumber}. This is fictional demonstration data.`;
  }
  return 'Hi! I can help you explore your demo order status, shipping timeline, or explain the project’s return windows. Try “Where is DEMO-1042?” This local assistant uses scripted sample responses and does not call the live AI agent.';
}
