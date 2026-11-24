import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { BareInput } from '../../../components/ui/Field';
import { Img } from '../../../components/ui/Img';
import { Sheet } from '../../../components/ui/Sheet';
import type { ProductImage } from '../../../data/schema';
import { productImageSources } from '../../../lib/assets';
import { useCatalog } from '../../../store/catalog';

/** Picks one of the photos already used by the products (its source, thumb and description are copied). */
export function ProductPhotoChooser({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (image: ProductImage) => void }) {
  const products = useCatalog((s) => s.data.products);
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return [...products]
      .sort((a, b) => a.order - b.order)
      .filter((p) => p.images.length && (!q || p.name.toLocaleLowerCase('pt-BR').includes(q)))
      .map((p) => ({ id: p.id, name: p.name, images: p.images }));
  }, [products, query]);

  return (
    <Sheet open={open} onClose={onClose} title="Fotos das peças" side="bottom" className="md-center">
      <div className="flex flex-col gap-4">
        <BareInput
          aria-label="Buscar peça pelo nome"
          placeholder="Buscar peça"
          icon={<Search size={18} strokeWidth={1.5} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{query ? 'Nenhuma peça com esse nome.' : 'Nenhuma peça com foto ainda.'}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {list.map((p) => (
              <li key={p.id}>
                <p className="mb-1.5 text-sm font-medium [overflow-wrap:anywhere]">{p.name}</p>
                <ul className="flex flex-wrap gap-2">
                  {p.images.map((img, i) => (
                    <li key={img.id}>
                      <button
                        type="button"
                        aria-label={`Usar a foto ${i + 1} de ${p.name}`}
                        onClick={() => onPick(img)}
                        className="block w-[76px] overflow-hidden rounded-[8px] ring-copper ring-offset-2 hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <Img {...productImageSources(img, true)} alt="" ratio="4 / 5" width={76} height={95} />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
