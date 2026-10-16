export interface CartLine { productId: string; quantity: number }
export interface CatalogLine { id: string; name: string; price: number; weight?: number; width?: number; height?: number; length?: number }
export function catalogItems(cart: CartLine[], products: CatalogLine[]) {
  if (!cart.length || cart.length > 100) throw new Error("Carrinho inválido");
  const ids = new Set<string>();
  return cart.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product || ids.has(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) throw new Error("Produto ou quantidade inválidos");
    ids.add(item.productId);
    return { ...product, productId: product.id, quantity: item.quantity, unit_amount: Number(product.price) };
  });
}
export function matchesPayment(stored: { reference_id: string; pagbank_id: string | null; total_amount: number }, verified: { reference_id: string; id: string; amount: number }): boolean {
  return stored.reference_id === verified.reference_id && stored.pagbank_id === verified.id && Math.round(Number(stored.total_amount) * 100) === verified.amount && verified.amount > 0;
}