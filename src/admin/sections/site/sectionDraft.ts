import type { Catalog } from '../../../data/schema';
import { sectionSchemas, type SectionId, type Sections } from '../../../data/content';

/*
 * Pure helpers of the site editor (Painel → Site): read limits from the shared
 * section schemas (so the counters never drift from what the server accepts),
 * immutable path updates on a draft, validation mapped to fields, and the
 * catalog updates that save or restore a section.
 */

export type Path = readonly (string | number)[];

/** Key of a field, as zod reports issue paths ("hero.title", "items.2.text"). */
export const pathKey = (path: Path): string => path.join('.');

/** The subset of zod's internal definition the walker needs. */
interface Def {
  type: string;
  shape?: Record<string, Node>;
  element?: Node;
  innerType?: Node;
  checks?: { _zod: { def: { check: string; maximum?: number; minimum?: number } } }[];
}
interface Node {
  def: Def;
  maxLength?: number | null;
  minLength?: number | null;
}

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'catch', 'readonly']);

function unwrap(node: Node): Node {
  let n = node;
  while (WRAPPERS.has(n.def.type) && n.def.innerType) n = n.def.innerType;
  return n;
}

/** The schema of a field of a section; numeric segments (any index) step into list items. */
export function schemaAt(id: SectionId, path: Path): Node | undefined {
  let node: Node | undefined = sectionSchemas[id] as unknown as Node;
  for (const segment of path) {
    if (!node) return undefined;
    const n = unwrap(node);
    if (typeof segment === 'number') node = n.def.type === 'array' ? n.def.element : undefined;
    else node = n.def.type === 'object' ? n.def.shape?.[segment] : undefined;
  }
  return node;
}

/** Character limit of a text field (0 when the path is not a limited text). */
export function textLimit(id: SectionId, path: Path): number {
  const node = schemaAt(id, path);
  return node ? (unwrap(node).maxLength ?? 0) : 0;
}

/** Whether a text field must be filled in. */
export function isRequired(id: SectionId, path: Path): boolean {
  const node = schemaAt(id, path);
  return node ? (unwrap(node).minLength ?? 0) >= 1 : false;
}

/** Whether an image field may be empty (null). */
export function isNullable(id: SectionId, path: Path): boolean {
  return schemaAt(id, path)?.def.type === 'nullable';
}

/** Item limits of a list field. */
export function listLimits(id: SectionId, path: Path): { min: number; max: number } {
  const node = schemaAt(id, path);
  let min = 0;
  let max = Infinity;
  for (const check of (node ? unwrap(node) : undefined)?.def.checks ?? []) {
    const def = check._zod.def;
    if (def.check === 'max_length' && def.maximum !== undefined) max = def.maximum;
    if (def.check === 'min_length' && def.minimum !== undefined) min = def.minimum;
  }
  return { min, max };
}

export function getIn(value: unknown, path: Path): unknown {
  let v = value;
  for (const segment of path) {
    if (v == null || typeof v !== 'object') return undefined;
    v = (v as Record<string | number, unknown>)[segment];
  }
  return v;
}

/** A copy of `value` with `next` at `path` (only the objects along the path are copied). */
export function setIn<T>(value: T, path: Path, next: unknown): T {
  if (!path.length) return next as T;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  const current = value as unknown;
  if (Array.isArray(current)) {
    const copy = [...current];
    copy[head as number] = setIn(copy[head as number], rest, next);
    return copy as T;
  }
  const obj = (current ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: setIn(obj[head as string], rest, next) } as T;
}

export type Validation<K extends SectionId> =
  | { ok: true; data: Sections[K] }
  /** `errors` by field key; `order` lists the keys as the schema reports them (top to bottom). */
  | { ok: false; errors: Record<string, string>; order: string[] };

/** Validates a draft with the section's schema and maps every problem to its field. */
export function validateSection<K extends SectionId>(id: K, draft: unknown): Validation<K> {
  const result = sectionSchemas[id].safeParse(draft);
  if (result.success) return { ok: true, data: result.data as Sections[K] };
  const errors: Record<string, string> = {};
  const order: string[] = [];
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.');
    if (errors[key]) continue;
    errors[key] = issue.message;
    order.push(key);
  }
  return { ok: false, errors, order };
}

/** The live problem of a text field while typing (over the limit), before any save. */
export function overLimit(value: string, max: number): string | undefined {
  const length = value.trim().length;
  return max > 0 && length > max ? `Use no máximo ${max} caracteres (agora são ${length}).` : undefined;
}

/** The catalog with the owner's version of a section (stamped with the moment of the save). */
export function putSection<K extends SectionId>(catalog: Catalog, id: K, data: Sections[K], at = new Date().toISOString()): Catalog {
  return { ...catalog, content: { ...catalog.content, [id]: { ...data, updatedAt: at } } };
}

/** The catalog without the owner's version of a section: the site shows the built-in text again. */
export function removeSection(catalog: Catalog, id: SectionId): Catalog {
  const content = { ...catalog.content };
  delete content[id];
  return { ...catalog, content };
}
