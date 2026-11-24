import { z } from 'zod';

/*
 * The owner's customers (docs/revenda/PLAN.md §1). Personal data: admin-only
 * (never in the public snapshot, logs or notices). Shared by the Worker and the admin.
 */

const text = (max: number) => z.string().max(max);

/** "(65) 99999-1234" → "65999991234" (empty stays empty). */
export const phoneDigits = (value: string) => value.replace(/\D/g, '');

/** Lowercased, accent-free, single-spaced: what the name search compares. */
export const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const customerRecordSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(80).min(2),
  /** Digits only (DDD + number), or empty. */
  whatsapp: z.string().regex(/^(\d{10,11})?$/),
  city: text(80),
  uf: text(2),
  instagram: text(60).optional(),
  /** "DD/MM" (no year: only for a birthday greeting). */
  birthday: z.string().regex(/^(\d{2}\/\d{2})?$/).optional(),
  note: text(600).optional(),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type CustomerRecord = z.infer<typeof customerRecordSchema>;

/** What the admin sends to create or edit a customer. */
export const customerInputSchema = z.object({
  name: z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(2, 'Informe o nome da cliente.').max(80, 'Nome longo demais.')),
  whatsapp: z
    .string()
    .transform(phoneDigits)
    .pipe(z.string().regex(/^(\d{10,11})?$/, 'WhatsApp com DDD, ex.: (65) 99999-9999')),
  city: z.string().trim().max(80).default(''),
  uf: z.string().trim().toUpperCase().max(2).default(''),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, ''))
    .pipe(z.string().regex(/^[A-Za-z0-9._]{0,30}$/, 'Digite só o @ do Instagram'))
    .optional(),
  birthday: z.string().regex(/^(\d{2}\/\d{2})?$/, 'Aniversário no formato DD/MM').optional(),
  note: z.string().max(600, 'Observação longa demais.').optional(),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

/** Warranty end date ("23/05/2027") for a purchase made at `at`. */
export function warrantyUntil(at: string | number | Date, months: number): string {
  const d = new Date(at);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 31/01 + 1 month would roll into March: keep the last day of the target month instead.
  if (d.getDate() < day) d.setDate(0);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** "6 meses" / "1 ano" for the {garantia} variable. */
export const warrantyText = (months: number) => (months === 12 ? '1 ano' : months % 12 === 0 ? `${months / 12} anos` : `${months} ${months === 1 ? 'mês' : 'meses'}`);
