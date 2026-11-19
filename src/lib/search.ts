/** Lowercases and strips accents so "anel" matches "Anéis". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Light pt-BR plural stemming: aneis→anel, colares→colar, brincos→brinco. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('is')) return `${word.slice(0, -2)}l`;
  if (word.length > 4 && /[rsz]es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** True when every word of the query appears in the haystack (accent- and plural-insensitive). */
export function matches(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const h = normalize(haystack);
  const stems = h.split(/[^a-z0-9]+/).map(stem).join(' ');
  return q.split(/\s+/).every((word) => h.includes(word) || stems.includes(stem(word)));
}
