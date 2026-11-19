import { create } from 'zustand';
import { favoritesSchema } from '../data/schema';
import { KEYS } from '../data/storage';
import { persistVisitorValue, readJSON } from './persisted';

interface FavoritesStore {
  ids: string[];
  toggle: (productId: string) => boolean;
  has: (productId: string) => boolean;
}

const load = () =>
  readJSON(KEYS.favorites, (raw) => {
    const parsed = favoritesSchema.safeParse(raw);
    return parsed.success ? parsed.data.ids : null;
  }) ?? [];

export const useFavorites = create<FavoritesStore>()((set, get) => ({
  ids: load(),
  toggle: (productId) => {
    const has = get().ids.includes(productId);
    const ids = has ? get().ids.filter((id) => id !== productId) : [...get().ids, productId];
    set({ ids });
    persistVisitorValue(KEYS.favorites, { ids }, 'os favoritos');
    return !has;
  },
  has: (productId) => get().ids.includes(productId),
}));
