export function listingImageValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(listingImageValues);
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return [
      record.secure_url,
      record.secureUrl,
      record.url,
      record.uri,
      record.imageUrl,
    ].flatMap(listingImageValues);
  }

  if (typeof value !== 'string') return [];

  const raw = value.trim();
  if (!raw) return [];

  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return listingImageValues(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  return [raw];
}
