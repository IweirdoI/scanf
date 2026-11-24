export interface Item { name: string; price: number; quantity: number }

export function subtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function discount(total: number, member: boolean): number {
  if (member && total >= 100) {
    return total * 0.9;
  }
  return total;
}
