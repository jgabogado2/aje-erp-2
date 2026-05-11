import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AppState {
  /** The site the user is currently working in. Null until they pick one. */
  currentSiteId: string | null;
  setCurrentSiteId: (id: string | null) => void;
}

// Persists in localStorage so the user's selection survives reloads. Tab-local
// is the right tradeoff — switching site is a UI affordance, not a shared
// session concern.
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentSiteId: null,
      setCurrentSiteId: (id) => set({ currentSiteId: id }),
    }),
    {
      name: 'hakda.app-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
