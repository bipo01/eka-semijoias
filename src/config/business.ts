/**
 * Business facts. Every value marked PENDING is a starting value that has not
 * been confirmed by the owner yet (see docs/PERGUNTAS_ERIKA.md). Rules:
 * - `null` hides the related claim in the public UI.
 * - Pending values are never labeled as pending in the public UI; the admin
 *   lists them in the "Complete as informações da loja" meter (src/admin/lib/setup.ts).
 * - Contact fields (WhatsApp, Instagram, city) and the warranty can be
 *   overridden from Admin → Configurações (stored in the catalog settings).
 */
export interface BusinessFacts {
  whatsapp: string | null;
  instagram: string | null;
  city: string | null;
  showroom: string | null;
  openingHours: string | null;
  warrantyMonths: number | null;
  hypoallergenic: boolean | null;
  shipsNationwide: boolean | null;
  installments: number | null;
  plating: string | null;
  resellerProgram: {
    enabled: boolean;
    consignment: boolean | null;
    noUpfrontInvestment: boolean | null;
    commissionTiers: { label: string; commission: string }[];
  };
}

export const business: BusinessFacts = {
  whatsapp: null, // PENDING — while null, links use https://wa.me/?text=… (contact picker)
  instagram: 'ekasemijoias', // PENDING — handle not confirmed
  city: null, // PENDING — city mentions hidden while null
  showroom: null, // PENDING — showroom blocks hidden while null
  openingHours: null, // PENDING
  warrantyMonths: 6, // PENDING — shown as "Garantia de 6 meses"
  hypoallergenic: null, // PENDING — "antialérgicas" claim hidden while null
  shipsNationwide: true, // PENDING
  installments: null, // PENDING — "parcelamento" hidden while null
  plating: null, // PENDING — plating spec (e.g. "ouro 18k, X milésimos"); seed details use generic wording
  resellerProgram: {
    enabled: true,
    consignment: null, // PENDING
    noUpfrontInvestment: null, // PENDING — "Sem investimento inicial" hidden while null
    commissionTiers: [], // PENDING — tiers table hidden while empty
  },
};
