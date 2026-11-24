import { business } from '../config/business';
import { factsOf } from '../content/defaults';
import { useCatalog } from '../store/catalog';

export interface ResolvedBusiness {
  whatsapp: string | null;
  instagram: string | null;
  instagramUrl: string | null;
  city: string | null;
  showroom: string | null;
  openingHours: string | null;
  warrantyMonths: number | null;
  /** What the warranty covers, as written by the owner (null when not filled in). */
  warrantyTerms: string | null;
  hypoallergenic: boolean | null;
  shipsNationwide: boolean | null;
  installments: number | null;
  /** Plating as the owner describes it (e.g. "banho de ouro 18k"), null when not informed. */
  plating: string | null;
  resellerProgram: typeof business.resellerProgram;
}

const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** Business facts: the admin-editable settings and "O que a loja oferece" (content section loja) over src/config/business.ts. */
export function useBusiness(): ResolvedBusiness {
  const settings = useCatalog((s) => s.data.settings);
  const content = useCatalog((s) => s.data.content);
  const facts = factsOf(settings, content);
  const instagram = orNull(settings.instagram);
  return {
    whatsapp: orNull(settings.whatsapp),
    instagram,
    instagramUrl: instagram ? `https://www.instagram.com/${instagram}/` : null,
    city: orNull(settings.city),
    showroom: orNull(settings.showroom),
    openingHours: orNull(settings.openingHours),
    warrantyMonths: settings.warrantyMonths > 0 ? settings.warrantyMonths : null,
    warrantyTerms: orNull(settings.warrantyTerms),
    hypoallergenic: facts.hypoallergenic,
    shipsNationwide: facts.shipsNationwide,
    installments: facts.installments,
    plating: facts.plating,
    resellerProgram: { ...business.resellerProgram, consignment: facts.consignment, noUpfrontInvestment: facts.noUpfrontInvestment },
  };
}

export function warrantyLabel(months: number): string {
  return months === 12 ? 'Garantia de 1 ano' : `Garantia de ${months} ${months === 1 ? 'mês' : 'meses'}`;
}
