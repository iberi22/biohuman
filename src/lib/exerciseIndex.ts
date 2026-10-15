/**
 * Helper to filter a list of strings by an accent-insensitive query.
 * @param items List of strings to filter (e.g. lowercased exercise names).
 * @param query The search query string.
 * @returns Array of indices that match the query.
 */
export function filterExercises(items: string[], query: string): number[] {
  if (!query || query.trim() === '') {
    return items.map((_, i) => i);
  }

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const search = normalize(query.trim());
  const indices: number[] = [];

  for (let i = 0; i < items.length; i++) {
    if (normalize(items[i]).includes(search)) {
      indices.push(i);
    }
  }

  return indices;
}
