import { create } from 'zustand';

interface FlowCommandState {
  spawnKind: string | null;
  spawnAt: { x: number; y: number } | null;
  spawnShotId: string | null;
  spawnData: Record<string, unknown> | null;
  templateId: string | null;
  templateMode: 'merge' | 'replace';
  /** 每次请求递增，确保 FlowSurface 在 ready 后能可靠消费模板 */
  templateRequestId: number;
  requestSpawn: (
    kind: string,
    at?: { x: number; y: number },
    data?: Record<string, unknown>,
  ) => void;
  requestSpawnForShot: (
    shotId: string,
    kind: string,
    at?: { x: number; y: number },
    data?: Record<string, unknown>,
  ) => void;
  requestLoadTemplate: (templateId: string, mode?: 'merge' | 'replace') => void;
  consumeSpawn: () => {
    kind: string;
    at: { x: number; y: number } | null;
    shotId: string | null;
    data: Record<string, unknown> | null;
  } | null;
  consumeTemplate: () => { templateId: string; mode: 'merge' | 'replace' } | null;
}

export const useFlowCommands = create<FlowCommandState>((set, get) => ({
  spawnKind: null,
  spawnAt: null,
  spawnShotId: null,
  spawnData: null,
  templateId: null,
  templateMode: 'merge' as const,
  templateRequestId: 0,

  requestSpawn: (kind, at, data) =>
    set({
      spawnKind: kind,
      spawnAt: at ?? null,
      spawnShotId: null,
      spawnData: data ?? null,
    }),

  requestSpawnForShot: (shotId, kind, at, data) =>
    set({
      spawnKind: kind,
      spawnShotId: shotId,
      spawnAt: at ?? null,
      spawnData: data ?? null,
    }),

  requestLoadTemplate: (templateId, mode = 'merge') =>
    set((s) => ({
      templateId,
      templateMode: mode,
      templateRequestId: s.templateRequestId + 1,
    })),

  consumeSpawn: () => {
    const { spawnKind, spawnAt, spawnShotId, spawnData } = get();
    if (!spawnKind) return null;
    set({ spawnKind: null, spawnAt: null, spawnShotId: null, spawnData: null });
    return { kind: spawnKind, at: spawnAt, shotId: spawnShotId, data: spawnData };
  },

  consumeTemplate: () => {
    const { templateId, templateMode } = get();
    if (!templateId) return null;
    set({ templateId: null });
    return { templateId, mode: templateMode };
  },
}));
