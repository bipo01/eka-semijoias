import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';

const ILLUSTRATION = '/images/illustrations/pagina-nao-encontrada';

/** Search engines should not index a page that does not exist (the server answers every page route with the app). */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

/**
 * "Esta peça escapou da caixinha": shown for an unknown address, a piece that left the catalog
 * or an unknown category. Concept and illustration made in ChatGPT from the brand style
 * (assets/illustrations/pagina-nao-encontrada.png); the title and text are editable in Painel → Site → Geral.
 */
export function NotFoundPage() {
  const { notFoundTitle, notFoundText } = useSection('geral');
  useDocumentTitle(notFoundTitle);
  useNoIndex();
  return (
    <div className="container-x flex min-h-[70dvh] flex-col items-center justify-center py-10 text-center md:py-16">
      <img
        src={`${ILLUSTRATION}-320.webp`}
        srcSet={`${ILLUSTRATION}-320.webp 320w, ${ILLUSTRATION}-640.webp 640w`}
        sizes="(min-width: 1024px) 300px, 260px"
        alt=""
        width={300}
        height={300}
        decoding="async"
        fetchPriority="high"
        className="size-[260px] lg:size-[300px]"
      />
      <p className="-mt-3 flex items-center gap-3 font-display text-[1.0625rem] italic text-copper" aria-hidden="true">
        <span className="h-px w-10 bg-rose/60" />
        404
        <span className="h-px w-10 bg-rose/60" />
      </p>
      <h1 className="mt-3 max-w-[16ch] font-display text-display-l text-balance break-words">{notFoundTitle}</h1>
      {notFoundText && <p className="mt-4 max-w-[34ch] whitespace-pre-line text-ink-muted [overflow-wrap:anywhere] text-pretty">{notFoundText}</p>}
      <ButtonLink to="/catalogo" className="mt-8 w-full max-w-xs">
        Ver catálogo
      </ButtonLink>
      <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-copper underline underline-offset-4">
        Ir para a página inicial
      </Link>
    </div>
  );
}
