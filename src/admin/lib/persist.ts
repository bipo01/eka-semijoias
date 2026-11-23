import type { Catalog } from '../../data/schema';
import { useCatalog, type SaveResult } from '../../store/catalog';
import { toast } from '../../store/ui';
import { signalSessionLost } from './session';

type Success = string | { message: string; action: { label: string; onClick: () => void } };

/** Shows the failure of a save; conflicts offer to reload the latest catalog. */
export function reportSaveError(result: Extract<SaveResult, { ok: false }>): void {
  if (result.code === 'unauthenticated') {
    signalSessionLost();
    return;
  }
  if (result.conflict) {
    toast(result.message, { tone: 'error', duration: 15_000, action: { label: 'Recarregar', onClick: () => void useCatalog.getState().load() } });
    return;
  }
  toast(result.message, { tone: 'error' });
}

/**
 * Saves a catalog update on the server. Resolves to true only after the
 * server confirmed it; on failure shows the error and resolves to false, so
 * the caller keeps its local state (a form stays open with its edits).
 */
export async function save(update: (data: Catalog) => Catalog, success?: Success, opts?: { onProgress?: (message: string) => void }): Promise<boolean> {
  const result = await useCatalog.getState().commit(update, opts);
  if (!result.ok) {
    reportSaveError(result);
    return false;
  }
  if (typeof success === 'string') toast(success, { tone: 'success' });
  else if (success) toast(success.message, { tone: 'success', action: success.action, duration: 10_000 }); // time to undo
  return true;
}
