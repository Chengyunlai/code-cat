function reserve(stock: number, requested: number): number {
  const remaining = stock - requested;
  console.log(remaining); // 在这里观察真实暂停；remaining 应为 5。
  return remaining;
}
reserve(8, 3);
