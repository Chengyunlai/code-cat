export function reserveInventory(stock: number, quantity: number): boolean {
  const available = stock >= quantity;
  return available;
}

const accepted = reserveInventory(8, 10);
console.log(accepted ? "已扣款" : "库存不足，未进入扣款步骤");
