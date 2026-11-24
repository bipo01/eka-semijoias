import { catalogSchema, catalogStateSchema, SCHEMA_VERSION, type Catalog, type CatalogState, type ResellerLead } from './schema';
import { parseSection, SECTION_IDS, SECTION_LABEL } from './content';

/*
 * Pure catalog checks shared by the browser and the Worker: versioned
 * migrations for backups and cross-reference integrity rules that zod cannot
 * express. No DOM or storage access here.
 */

export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a payload from schemaVersion n to n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  // v1 kept the PIN hash next to the catalog and a localStorage-only flag; both moved out.
  1: (old) => {
    const { customized: _customized, ...rest } = old;
    const settings = typeof rest.settings === 'object' && rest.settings !== null ? { ...(rest.settings as Record<string, unknown>) } : rest.settings;
    if (settings && typeof settings === 'object') delete (settings as Record<string, unknown>).pinHash;
    return { ...rest, settings, leads: Array.isArray(rest.leads) ? rest.leads : [] };
  },
};

export type MigrationResult =
  | { ok: true; state: CatalogState; migratedFrom: number | null }
  | { ok: false; error: string; newer?: boolean };

/** Upgrades and validates a backup (catalog + leads). */
export function migrateCatalog(input: unknown, migrations: Record<number, Migration> = MIGRATIONS): MigrationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'O arquivo não contém um catálogo.' };
  }
  let data = input as Record<string, unknown>;
  const startVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : NaN;
  if (!Number.isInteger(startVersion)) return { ok: false, error: 'O arquivo não informa a versão do catálogo.' };
  if (startVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Este backup foi feito por uma versão mais nova do site.', newer: true };
  }
  let version = startVersion;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) return { ok: false, error: `Não há como atualizar dados da versão ${version}.` };
    try {
      data = { ...step(data), schemaVersion: version + 1 };
    } catch {
      return { ok: false, error: `Falha ao atualizar dados da versão ${version}.` };
    }
    version++;
  }
  if (!Array.isArray(data.leads)) data = { ...data, leads: [] };
  // Site sections are checked strictly: the lenient catalog schema would drop an unreadable one,
  // and restoring the file would then silently put that live page back to the built-in text.
  const content = data.content;
  if (content !== undefined && (typeof content !== 'object' || content === null || Array.isArray(content))) return { ok: false, error: 'Os textos do site no arquivo estão em um formato inesperado.' };
  for (const sid of SECTION_IDS) {
    const section = (content as Record<string, unknown> | undefined)?.[sid];
    if (section === undefined) continue;
    const r = parseSection(sid, section);
    if (!r.ok) return { ok: false, error: `A parte “${SECTION_LABEL[sid]}” dos textos do site não pôde ser lida (${r.error}${r.path ? ` em ${r.path}` : ''}).` };
  }
  const parsed = catalogStateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: describeIssue(parsed.error.issues[0]) };
  const integrity = checkIntegrity(parsed.data);
  if (integrity) return { ok: false, error: integrity };
  return { ok: true, state: parsed.data, migratedFrom: startVersion === SCHEMA_VERSION ? null : startVersion };
}

function describeIssue(issue: { path: PropertyKey[]; message: string } | undefined): string {
  const where = issue?.path.map(String).join('.') || 'catálogo';
  return `Dados inválidos em "${where}": ${issue?.message ?? 'formato inesperado'}.`;
}

type IntegrityInput = Pick<Catalog, 'products' | 'categories' | 'collections'> & { leads?: ResellerLead[] };

/** Cross-reference checks zod cannot express (unique ids/slugs, existing categories, image references). */
export function checkIntegrity(state: IntegrityInput): string | null {
  const duplicate = (values: string[]) => values.find((v, i) => values.indexOf(v) !== i);
  const dupCategory = duplicate(state.categories.map((c) => c.id)) ?? duplicate(state.categories.map((c) => c.slug));
  if (dupCategory) return `Categoria repetida: ${dupCategory}.`;
  const dupCollection = duplicate(state.collections.map((c) => c.id)) ?? duplicate(state.collections.map((c) => c.slug));
  if (dupCollection) return `Coleção repetida: ${dupCollection}.`;
  if (state.leads && duplicate(state.leads.map((l) => l.id))) return 'Cadastro de revendedora repetido.';
  const categoryIds = new Set(state.categories.map((c) => c.id));
  const collectionIds = new Set(state.collections.map((c) => c.id));
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const p of state.products) {
    if (ids.has(p.id)) return `Produto repetido: ${p.name}.`;
    ids.add(p.id);
    if (slugs.has(p.slug)) return `Endereço de produto repetido: ${p.slug}.`;
    slugs.add(p.slug);
    if (!categoryIds.has(p.categoryId)) return `A peça "${p.name}" aponta para uma categoria que não existe.`;
    if (p.collectionIds.some((id) => !collectionIds.has(id))) return `A peça "${p.name}" aponta para uma coleção que não existe.`;
    const imageIds = new Set(p.images.map((i) => i.id));
    if (imageIds.size !== p.images.length) return `A peça "${p.name}" tem fotos repetidas.`;
    if (duplicate(p.variants.map((v) => v.id))) return `A peça "${p.name}" tem acabamentos repetidos.`;
    for (const v of p.variants) {
      if (v.imageIds.some((imgId) => !imageIds.has(imgId))) return `A peça "${p.name}" tem foto de acabamento inválida.`;
    }
  }
  return null;
}

/** Validates a public catalog: schema plus integrity. Returns a pt-BR problem or null. */
export function validateCatalog(catalog: Catalog): string | null {
  // The catalog schema lets an unreadable section fall back to the built-in text (for visitors);
  // a save must instead refuse it, with the field, before the server does.
  for (const sid of SECTION_IDS) {
    const data = (catalog.content as Record<string, unknown> | undefined)?.[sid];
    if (data === undefined) continue;
    const r = parseSection(sid, data);
    if (!r.ok) return `${r.error} (${SECTION_LABEL[sid]}${r.path ? `: ${r.path}` : ''})`;
  }
  const parsed = catalogSchema.safeParse(catalog);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `${issue?.message ?? 'formato inesperado'} (${issue?.path.map(String).join('.') || 'catálogo'})`;
  }
  return checkIntegrity(parsed.data);
}
