type Order = { sku: string; quantity: number };

const stock = new Map<string, number>([['book', 8]]);

function reserveInventory(order: Order): number {
  const available = stock.get(order.sku) ?? 0;
  if (available < order.quantity) {
    throw new Error('库存不足');
  }
  const remaining = available - order.quantity;
  stock.set(order.sku, remaining);
  return remaining;
}

function checkout(order: Order): string {
  reserveInventory(order);
  return '可以继续支付';
}

console.log(checkout({ sku: 'book', quantity: 3 }));
