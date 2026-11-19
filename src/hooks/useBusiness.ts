import { business } from '../config/business';
import { useCatalog } from '../store/catalog';

export interface ResolvedBusiness {
  whatsapp: string | null;
  instagram: string | null;
  instagramUrl: string | null;
  city: string | null;
  showroom: string | null;
  openingHours: string | null;
  warrantyMonths: number | null;
  hypoallergenic: boolean | null;
  shipsNationwide: boolean | null;
  installments: number | null;
  resellerProgram: typeof business.resellerProgram;
}

const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** Business facts with the admin-editable settings layered over src/config/business.ts. */
export function useBusiness(): ResolvedBusiness {
  const settings = useCatalog((s) => s.data.settings);
  const instagram = orNull(settings.instagram);
  return {
    whatsapp: orNull(settings.whatsapp),
    instagram,
    instagramUrl: instagram ? `https://www.instagram.com/${instagram}/` : null,
    city: orNull(settings.city),
    showroom: orNull(settings.showroom),
    openingHours: orNull(settings.openingHours),
    warrantyMonths: settings.warrantyMonths > 0 ? settings.warrantyMonths : null,
    hypoallergenic: business.hypoallergenic,
    shipsNationwide: business.shipsNationwide,
    installments: business.installments,
    resellerProgram: business.resellerProgram,
  };
}

export function warrantyLabel(months: number): string {
  return months === 12 ? 'Garantia de 1 ano' : `Garantia de ${months} ${months === 1 ? 'mês' : 'meses'}`;
}
