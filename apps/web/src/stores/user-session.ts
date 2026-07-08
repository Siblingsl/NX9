import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSummary } from '@nx9/shared';
import { api } from '../api/client';

interface UserSessionState {
  userId: string | null;
  user: UserSummary | null;
  users: UserSummary[];
  bootstrap: () => Promise<void>;
  setUser: (user: UserSummary) => void;
  fetchUsers: () => Promise<void>;
  createUser: (name: string) => Promise<void>;
}

export const useUserSession = create<UserSessionState>()(
  persist(
    (set, get) => ({
      userId: null,
      user: null,
      users: [],

      bootstrap: async () => {
        const user = await api.bootstrapUser();
        set({ userId: user.id, user });
        await get().fetchUsers();
      },

      setUser: (user) => set({ userId: user.id, user }),

      fetchUsers: async () => {
        const users = await api.listUsers();
        set({ users });
      },

      createUser: async (name) => {
        const user = await api.createUser(name);
        set({ userId: user.id, user });
        await get().fetchUsers();
      },
    }),
    { name: 'nx9-user-session' },
  ),
);
