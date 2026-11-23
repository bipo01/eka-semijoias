import { jsonEqual, type Change, type EntityKind } from '../src/data/changes';
import type { Catalog } from '../src/data/schema';

/* Per-entity conflict detection for admin writes (pure; unit-tested). */

export const entityKey = (kind: EntityKind, id: string) => `${kind}:${id}`;

const LIST: Record<EntityKind, 'products' | 'categories' | 'collections'> = { product: 'products', category: 'categories', collection: 'collections' };

export interface ConflictState {
  catalog: Catalog;
  /** entityKey → catalog version of the entity's last change */
  versions: Map<string, number>;
  /** entityKey → catalog version of its deletion */
  tombstones: Map<string, number>;
  settingsVersion: number;
}

interface Conflict {
  kind: EntityKind | 'settings';
  id?: string;
  name?: string;
  reason: 'changed' | 'deleted';
}

const nameOf = (entity: unknown) => (entity && typeof entity === 'object' && 'name' in entity ? String((entity as { name: unknown }).name) : undefined);

/**
 * Per-entity lost-update protection. A change conflicts when the stored
 * entity changed after the client's `baseVersion` and the client is not
 * writing exactly what is stored; deleted entities stay deleted (tombstones).
 */
export function findConflicts(state: ConflictState, changes: Change[], baseVersion: number): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const change of changes) {
    if (change.kind === 'settings') {
      if (state.settingsVersion > baseVersion && !jsonEqual(state.catalog.settings, change.data)) conflicts.push({ kind: 'settings', reason: 'changed' });
      continue;
    }
    const key = entityKey(change.kind, change.id);
    const rowVersion = state.versions.get(key);
    const current = (state.catalog[LIST[change.kind]] as { id: string }[]).find((e) => e.id === change.id);
    if (change.op === 'delete') {
      if (rowVersion !== undefined && rowVersion > baseVersion) conflicts.push({ kind: change.kind, id: change.id, name: nameOf(current), reason: 'changed' });
      continue;
    }
    if (rowVersion !== undefined) {
      if (rowVersion > baseVersion && !jsonEqual(current, change.data)) conflicts.push({ kind: change.kind, id: change.id, name: nameOf(current), reason: 'changed' });
    } else {
      const deletedAt = state.tombstones.get(key);
      if (deletedAt !== undefined && deletedAt > baseVersion) conflicts.push({ kind: change.kind, id: change.id, name: nameOf(change.data), reason: 'deleted' });
    }
  }
  return conflicts;
}

export function conflictMessage(conflicts: Conflict[]): string {
  const first = conflicts[0]!;
  const what = first.kind === 'settings' ? 'as informações da loja' : first.name ? `“${first.name}”` : 'um item que você editou';
  const verb = first.reason === 'deleted' ? 'excluiu' : 'alterou';
  const more = conflicts.length > 1 ? ` e mais ${conflicts.length - 1} ${conflicts.length === 2 ? 'item' : 'itens'}` : '';
  return `Outro aparelho ${verb} ${what}${more} depois que você abriu esta tela. Recarregue para ver a versão atual e refaça a alteração.`;
}

