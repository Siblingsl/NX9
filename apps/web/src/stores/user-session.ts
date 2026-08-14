import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSummary } from '@nx9/shared';
import { api } from '../api/client';

export type SessionStatus = 'restoring' | 'signed-out' | 'signed-in';

interface UserSessionState {
  userId: string | null;
  user: UserSummary | null;
  users: UserSummary[];
  token: string | null;
  status: SessionStatus;
  /** 启动时恢复本机会话（记住本机） */
  restore: () => Promise<void>;
  login: (name: string, password: string) => Promise<{ adoptedLegacy: boolean }>;
  register: (name: string, password: string) => Promise<{ adoptedLegacy: boolean }>;
  logout: () => Promise<void>;
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
      token: null,
      status: 'restoring',

      restore: async () => {
        const { token, userId } = get();
        if (!token) {
          set({ status: 'signed-out', userId: null, user: null });
          return;
        }
        try {
          const user = await api.authMe();
          set({ status: 'signed-in', userId: user.id, user });
          void get().fetchUsers().catch(() => undefined);
        } catch {
          // token 失效：清除会话，回到登录页
          set({ status: 'signed-out', userId: null, user: null, token: null });
        }
      },

      login: async (name, password) => {
        const res = await api.authLogin(name, password);
        set({ token: res.token, userId: res.user.id, user: res.user, status: 'signed-in' });
        void get().fetchUsers().catch(() => undefined);
        return { adoptedLegacy: res.adoptedLegacy };
      },

      register: async (name, password) => {
        const res = await api.authRegister(name, password);
        set({ token: res.token, userId: res.user.id, user: res.user, status: 'signed-in' });
        void get().fetchUsers().catch(() => undefined);
        return { adoptedLegacy: res.adoptedLegacy };
      },

      logout: async () => {
        const { token } = get();
        if (token) {
          try {
            await api.authLogout();
          } catch {
            /* 本地退出不因网络失败阻塞 */
          }
        }
        set({ token: null, userId: null, user: null, users: [], status: 'signed-out' });
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
    {
      name: 'nx9-user-session',
      partialize: (s) => ({ userId: s.userId, user: s.user, token: s.token }),
    },
  ),
);
