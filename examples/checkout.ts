import { subtotal, discount, Item } from './pricing';
import { saveOrder } from './storage';

export async function checkout(items: Item[], member: boolean) {
  if (items.length === 0) {
    throw new Error('购物车为空');
  }
  const total = subtotal(items);
  const payable = discount(total, member);
  try {
    const order = await saveOrder({ items, payable });
    return { ok: true, order };
  } catch (error) {
    return { ok: false, error };
  }
}
