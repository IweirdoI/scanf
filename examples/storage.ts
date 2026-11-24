export async function saveOrder(order: unknown) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify(order)
  });
  if (!response.ok) {
    throw new Error('保存失败');
  }
  return response.json();
}
