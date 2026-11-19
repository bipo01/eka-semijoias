import { normalize } from './search';

export function slugify(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Returns a slug not present in `taken`, appending -2, -3… when needed. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = slugify(base) || 'peca';
  if (!set.has(root)) return root;
  let i = 2;
  const withSuffix = (n: number) => `${root.slice(0, 80 - `-${n}`.length).replace(/-+$/, '')}-${n}`;
  while (set.has(withSuffix(i))) i++;
  return withSuffix(i);
}
