import { create } from 'zustand';
import type { WorkspaceSummary, WorkspaceVisibility } from '@nx9/shared';
import { isPrivateWorkspace } from '@nx9/shared';
import { api } from '../api/client';

export interface CreateWorkspaceOptions {
  title?: string;
  visibility?: WorkspaceVisibility;
}

interface WorkspaceCatalogState {
  items: WorkspaceSummary[];
  activeId: string | null;
  /** 主栏展示的工作区 id（关闭栏标签不会删除工作区数据） */
  openIds: string[];
  loading: boolean;
  /** 递增后触发画布 remount */
  reloadToken: number;
  fetchAll: () => Promise<void>;
  setActive: (id: string | null) => void;
  selectWorkspace: (id: string) => void;
  create: (options?: string | CreateWorkspaceOptions) => Promise<WorkspaceSummary>;
  rename: (id: string, title: string) => Promise<void>;
  /** 从主栏关闭工作区标签，不删除工作区与素材数据 */
  closeWorkspace: (id: string) => void;
  privateWorkspaces: () => WorkspaceSummary[];
  railWorkspaces: () => WorkspaceSummary[];
}

function normalizeCreateOptions(
  options?: string | CreateWorkspaceOptions,
): CreateWorkspaceOptions {
  if (typeof options === 'string') return { title: options, visibility: 'private' };
  return { title: options?.title, visibility: options?.visibility ?? 'private' };
}

const OPEN_WS_STORAGE = 'nx9-open-workspaces';

function storageKey(ownerId?: string) {
  return `${OPEN_WS_STORAGE}-${ownerId ?? 'default'}`;
}

function loadOpenIds(ownerId?: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

function saveOpenIds(ownerId: string | undefined, ids: string[]) {
  localStorage.setItem(storageKey(ownerId), JSON.stringify(ids));
}

export const useWorkspaceCatalog = create<WorkspaceCatalogState>((set, get) => ({
  items: [],
  activeId: null,
  openIds: [],
  loading: false,
  reloadToken: 0,

  privateWorkspaces: () => get().items.filter(isPrivateWorkspace),

  railWorkspaces: () => {
    const { items, openIds } = get();
    return items.filter((w) => isPrivateWorkspace(w) && openIds.includes(w.id));
  },

  fetchAll: async () => {
    set({ loading: true });
    try {
      const { useUserSession } = await import('./user-session');
      const ownerId = useUserSession.getState().userId ?? undefined;
      const items = await api.listWorkspaces(ownerId);
      const privates = items.filter(isPrivateWorkspace);
      const stored = loadOpenIds(ownerId);
      const openIds =
        stored?.filter((id) => privates.some((w) => w.id === id)) ??
        privates.map((w) => w.id);
      if (!stored) saveOpenIds(ownerId, openIds);
      set({ items, openIds });
      const active = get().activeId;
      if (!active && openIds.length > 0) {
        set({ activeId: openIds[0] });
        return;
      }
      if (active && !openIds.includes(active)) {
        set({ activeId: openIds[0] ?? null });
      }
    } finally {
      set({ loading: false });
    }
  },

  setActive: (id) => set({ activeId: id }),

  selectWorkspace: async (id) => {
    const { openIds, activeId, reloadToken } = get();
    const needsOpen = !openIds.includes(id);
    const nextOpenIds = needsOpen ? [...openIds, id] : openIds;
    if (needsOpen) {
      const { useUserSession } = await import('./user-session');
      const ownerId = useUserSession.getState().userId ?? undefined;
      saveOpenIds(ownerId, nextOpenIds);
    }
    if (activeId === id && !needsOpen) return;
    set({
      activeId: id,
      openIds: nextOpenIds,
      reloadToken: reloadToken + 1,
    });
  },

  create: async (options) => {
    const { title, visibility } = normalizeCreateOptions(options);
    const { useUserSession } = await import('./user-session');
    const ownerId = useUserSession.getState().userId ?? undefined;
    const item = await api.createWorkspace(title, ownerId, visibility);
    const openIds =
      visibility === 'private' ? [...get().openIds, item.id] : get().openIds;
    if (visibility === 'private') saveOpenIds(ownerId, openIds);
    set({
      items: [...get().items, item],
      activeId: visibility === 'private' ? item.id : get().activeId,
      openIds,
      reloadToken: visibility === 'private' ? get().reloadToken + 1 : get().reloadToken,
    });
    return item;
  },

  rename: async (id, title) => {
    const updated = await api.renameWorkspace(id, title);
    set({ items: get().items.map((w) => (w.id === id ? { ...w, ...updated } : w)) });
  },

  closeWorkspace: async (id) => {
    const { useUserSession } = await import('./user-session');
    const ownerId = useUserSession.getState().userId ?? undefined;
    const openIds = get().openIds.filter((x) => x !== id);
    saveOpenIds(ownerId, openIds);
    const wasActive = get().activeId === id;
    const nextActive = wasActive ? openIds[0] ?? null : get().activeId;
    set({
      openIds,
      activeId: nextActive,
      reloadToken: wasActive ? get().reloadToken + 1 : get().reloadToken,
    });
  },
}));
