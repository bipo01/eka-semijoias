import type { MessageVars } from '../data/messages';
import { z } from 'zod';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

/** Formats digits as "(65) 99999-9999" while typing. */
export function maskPhone(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const leadFormSchema = z.object({
  name: z.string().trim().min(3, 'Digite seu nome completo').max(120, 'Nome muito longo'),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((d) => d.length === 10 || d.length === 11, 'Digite o WhatsApp com DDD, ex.: (65) 99999-9999'),
  city: z.string().trim().min(2, 'Digite sua cidade').max(80, 'Cidade muito longa'),
  uf: z.enum(UFS, { message: 'Escolha o estado' }),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, ''))
    .refine((v) => v === '' || /^[A-Za-z0-9._]{1,30}$/.test(v), 'Digite só o @ do Instagram'),
  alreadySells: z.boolean({ message: 'Responda se você já revende' }),
  source: z.string().trim().max(200, 'Texto muito longo'),
  consent: z.literal(true, { message: 'Marque a autorização para a gente entrar em contato' }),
});

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadForm = z.output<typeof leadFormSchema>;

/** The pre-registration as template values (Painel → Mensagens → "Quero ser revendedora"). */
export function leadVars(lead: LeadForm): MessageVars {
  return {
    nome: lead.name,
    whatsapp: maskPhone(lead.whatsapp),
    cidade: lead.city,
    uf: lead.uf,
    instagram: lead.instagram,
    ja_revende: lead.alreadySells ? 'Sim' : 'Não',
    origem: lead.source,
  };
}
