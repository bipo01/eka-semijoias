import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Loader } from '../ui/Loader';
import { useCatalog } from '../../store/catalog';

/**
 * Renders the page only once the catalog is known, so a product or category
 * page never flashes "não encontrado" while the first load is in flight.
 * Return visits render instantly from the cached copy.
 */
export function CatalogGate({ children }: { children: ReactNode }) {
  const status = useCatalog((s) => s.status);
  const load = useCatalog((s) => s.load);
  if (status === 'ready') return <>{children}</>;
  if (status === 'loading') {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader label="Carregando as peças…" />
      </div>
    );
  }
  return (
    <div role="alert" className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-display-m">Não foi possível carregar as peças</h1>
      <p className="text-ink-muted">Confira a sua conexão com a internet e tente de novo.</p>
      <Button onClick={() => void load()}>Tentar de novo</Button>
    </div>
  );
}
