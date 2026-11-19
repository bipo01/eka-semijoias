import { create } from 'zustand';
import { customerSchema, type Customer } from '../data/schema';
import { KEYS } from '../data/storage';
import { persistVisitorValue, readJSON } from './persisted';

interface CustomerStore extends Customer {
  note: string;
  setField: (field: 'name' | 'city' | 'note', value: string) => void;
}

const stored = readJSON(KEYS.customer, (raw) => {
  const parsed = customerSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
});

export const useCustomer = create<CustomerStore>()((set, get) => ({
  name: stored?.name ?? '',
  city: stored?.city ?? '',
  note: '',
  setField: (field, value) => {
    set({ [field]: value } as Pick<CustomerStore, typeof field>);
    if (field !== 'note') {
      const { name, city } = get();
      persistVisitorValue(KEYS.customer, { name: name.slice(0, 80), city: city.slice(0, 80) }, 'seus dados');
    }
  },
}));
