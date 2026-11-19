import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { Monogram } from '../components/ui/Icons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Peça não encontrada');
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-center justify-center gap-4 py-16 text-center">
      <Monogram className="size-14 text-rose" />
      <h1 className="font-display text-display-l">Peça não encontrada</h1>
      <p className="max-w-sm text-ink-muted">Ela pode ter saído do catálogo ou o endereço mudou. Que tal ver as outras peças?</p>
      <ButtonLink to="/catalogo">Ver catálogo</ButtonLink>
      <Link to="/" className="min-h-11 text-copper underline underline-offset-4">Ir para a página inicial</Link>
    </div>
  );
}
