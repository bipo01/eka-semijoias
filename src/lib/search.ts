/** Lowercases and strips accents so "anel" matches "Anéis". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** True when every word of the query appears in the haystack (accent-insensitive). */
export function matches(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const h = normalize(haystack);
  return q.split(/\s+/).every((word) => h.includes(word) || h.includes(singular(word)));
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('is')) return word.slice(0, -2) + 'l'; // aneis -> anel
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}
