import { describe, expect, it } from 'vitest';
import { composeMessage } from '../data/messages';
import { leadFormSchema, leadVars, maskPhone } from './lead';

const valid = { name: 'Ana Souza', whatsapp: '(65) 99999-1234', city: 'Cuiabá', uf: 'MT', instagram: '@ana.semi', alreadySells: false, source: 'Instagram', consent: true };

describe('maskPhone', () => {
  it('masks progressively', () => {
    expect(maskPhone('6')).toBe('(6');
    expect(maskPhone('65999')).toBe('(65) 999');
    expect(maskPhone('6533334444')).toBe('(65) 3333-4444');
    expect(maskPhone('65999991234')).toBe('(65) 99999-1234');
    expect(maskPhone('6599999123499')).toBe('(65) 99999-1234');
  });
});

describe('leadFormSchema', () => {
  it('accepts a valid form and normalizes fields', () => {
    const r = leadFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.whatsapp).toBe('65999991234');
      expect(r.data.instagram).toBe('ana.semi');
    }
  });

  it('returns pt-BR messages per field', () => {
    const r = leadFormSchema.safeParse({ ...valid, name: 'A', whatsapp: '999', city: '', uf: '', consent: false, instagram: 'not valid!' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const byField = Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
      expect(byField.name).toBe('Digite seu nome completo');
      expect(byField.whatsapp).toMatch(/DDD/);
      expect(byField.city).toBe('Digite sua cidade');
      expect(byField.uf).toBe('Escolha o estado');
      expect(byField.consent).toMatch(/autorização/);
      expect(byField.instagram).toMatch(/Instagram/);
    }
  });

  it('builds the intro message without empty lines for optional fields', () => {
    const r = leadFormSchema.parse({ ...valid, instagram: '', source: '' });
    const msg = composeMessage(undefined, 'revendedora', leadVars(r));
    expect(msg).toContain('Cidade: Cuiabá/MT');
    expect(msg).toContain('WhatsApp: (65) 99999-1234');
    expect(msg).not.toContain('Instagram');
    expect(msg).not.toContain('Conheci');
  });
});
