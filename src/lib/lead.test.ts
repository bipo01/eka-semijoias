import { describe, expect, it } from 'vitest';
import { leadFormSchema, leadMessage, maskPhone } from './lead';

const valid = { name: 'Ana Souza', whatsapp: '(67) 99999-1234', city: 'Campo Grande', uf: 'MS', instagram: '@ana.semi', alreadySells: false, source: 'Instagram', consent: true };

describe('maskPhone', () => {
  it('masks progressively', () => {
    expect(maskPhone('6')).toBe('(6');
    expect(maskPhone('67999')).toBe('(67) 999');
    expect(maskPhone('6733334444')).toBe('(67) 3333-4444');
    expect(maskPhone('67999991234')).toBe('(67) 99999-1234');
    expect(maskPhone('6799999123499')).toBe('(67) 99999-1234');
  });
});

describe('leadFormSchema', () => {
  it('accepts a valid form and normalizes fields', () => {
    const r = leadFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.whatsapp).toBe('67999991234');
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
    const msg = leadMessage(r);
    expect(msg).toContain('Cidade: Campo Grande/MS');
    expect(msg).toContain('WhatsApp: (67) 99999-1234');
    expect(msg).not.toContain('Instagram');
    expect(msg).not.toContain('Conheci');
  });
});
