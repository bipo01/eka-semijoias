/** Moves one item of a list to another index (clamped). Returns a new array. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const target = Math.max(0, Math.min(next.length - 1, to));
  if (from < 0 || from >= next.length || from === target) return next;
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

/**
 * Applies a new order to a visible subset (e.g. a filtered list): the subset
 * keeps the slots it occupied in the full order, in its new sequence. Returns
 * an id → order map with dense orders 0..n-1 for every item.
 */
export function reorderSubset<T extends { id: string; order?: number | undefined }>(all: readonly T[], subsetInNewOrder: readonly string[]): Map<string, number> {
  const sorted = [...all].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const inSubset = new Set(subsetInNewOrder);
  const queue = [...subsetInNewOrder];
  const result = new Map<string, number>();
  sorted.forEach((item, index) => {
    const id = inSubset.has(item.id) ? queue.shift()! : item.id;
    result.set(id, index);
  });
  return result;
}
