export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function normalizeSearch(input: string): string {
  return stripAccents(input).toLowerCase().trim();
}

export function slugify(input: string): string {
  return normalizeSearch(input)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
