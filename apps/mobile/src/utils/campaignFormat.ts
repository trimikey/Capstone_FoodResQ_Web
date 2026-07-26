type ItemLike = {
  name?: unknown;
  type?: unknown;
  unit?: unknown;
  quantity?: unknown;
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
  const quantity = [textOf(data.quantity), textOf(data.unit)].filter(Boolean).join(' ');
  const type = textOf(data.type);

  return [name, quantity ? `- ${quantity}` : '', type ? `(${type})` : ''].filter(Boolean).join(' ');
}

export function formatSupplyItem(item: unknown): string {
  if (typeof item === 'string') return item;
  return formatMenuItem(item);
}
