import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { NotFoundPage } from '../../pages/NotFound';
import { Button } from '../ui/Button';

export function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  // A missing address gets the same page as any other not-found route (reloading would not help).
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="font-display text-display-l">Algo deu errado</h1>
      <p className="max-w-sm text-ink-muted">Recarregue a página para tentar de novo.</p>
      <Button onClick={() => window.location.reload()}>Recarregar</Button>
    </div>
  );
}
