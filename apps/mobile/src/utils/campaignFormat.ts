type ItemLike = {
  name?: unknown;
  type?: unknown;
  unit?: unknown;
  quantity?: unknown;
  plannedServings?: unknown;
};

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

export function formatMenuItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return 'Món';

  const data = item as ItemLike;
  const name = textOf(data.name) || 'Món';
  const planned = textOf(data.plannedServings);
  const quantity = [textOf(data.quantity) || planned, textOf(data.unit)].filter(Boolean).join(' ');
  const type = textOf(data.type);

  return [name, quantity ? `- ${quantity}` : '', type ? `(${type})` : ''].filter(Boolean).join(' ');
}

export function formatSupplyItem(item: unknown): string {
  if (typeof item === 'string') return item;
  return formatMenuItem(item);
}

export function normalizeSupplyItem(item: unknown): { name: string; quantity?: number | null; unit?: string | null } | null {
  if (typeof item === 'string') {
    const name = item.trim();
    return name ? { name } : null;
  }
  if (!item || typeof item !== 'object') return null;
  const data = item as ItemLike;
  const name = textOf(data.name);
  if (!name) return null;
  const numericQuantity = typeof data.quantity === 'number' ? data.quantity : Number(textOf(data.quantity));
  return {
    name,
    quantity: Number.isFinite(numericQuantity) ? numericQuantity : null,
    unit: textOf(data.unit) || null,
  };
}
