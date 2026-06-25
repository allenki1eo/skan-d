import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Company } from '@skan-d/shared';

interface AuthState {
  accessToken: string | null;
  user: (Omit<User, 'companyId'> & { company: Pick<Company, 'id' | 'name' | 'slug'> }) | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setToken: (accessToken) => set({ accessToken }),
      logout: () => set({ accessToken: null, user: null }),
    }),
    { name: 'skan-d-auth', partialize: (s) => ({ user: s.user }) }
  )
);
