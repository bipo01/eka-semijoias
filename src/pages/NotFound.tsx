import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { Monogram } from '../components/ui/Icons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';

export function NotFoundPage() {
  const { notFoundTitle, notFoundText } = useSection('geral');
  useDocumentTitle(notFoundTitle);
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-center justify-center gap-4 py-16 text-center">
      <Monogram className="size-14 text-rose" />
      <h1 className="max-w-full font-display text-display-l break-words">{notFoundTitle}</h1>
      {notFoundText && <p className="max-w-sm whitespace-pre-line [overflow-wrap:anywhere] text-ink-muted">{notFoundText}</p>}
      <ButtonLink to="/catalogo">Ver catálogo</ButtonLink>
      <Link to="/" className="min-h-11 text-copper underline underline-offset-4">Ir para a página inicial</Link>
    </div>
  );
}
