import { create } from 'zustand';
import type { TakeRecord } from '@nx9/shared';
import { applyPrimaryTakeToNodeData, newTakeId } from '../utils/take-utils';

interface PickTakeOptions {
  onBeforePick?: () => void;
  updateNodeData: (blockId: string, data: Record<string, unknown>) => void;
}

interface TakeStoreState {
  takes: TakeRecord[];
  lightboxTakeId: string | null;
  comparePair: [string, string] | null;
  hydrate: (takes: TakeRecord[] | undefined) => void;
  getForBlock: (blockId: string) => TakeRecord[];
  getPrimaryTake: (blockId: string) => TakeRecord | undefined;
  appendTake: (
    blockId: string,
    assetUrl: string,
    thumbUrl?: string,
    meta?: Record<string, unknown>,
  ) => TakeRecord;
  pickTake: (takeId: string, options: PickTakeOptions) => void;
  openLightbox: (takeId: string) => void;
  openCompare: (takeIdA: string, takeIdB: string) => void;
  closeLightbox: () => void;
  closeCompare: () => void;
  exportTakes: () => TakeRecord[];
}

export const useTakeStore = create<TakeStoreState>((set, get) => ({
  takes: [],
  lightboxTakeId: null,
  comparePair: null,

  hydrate: (takes) => set({ takes: takes ?? [] }),

  getForBlock: (blockId) =>
    get()
      .takes.filter((t) => t.blockId === blockId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),

  getPrimaryTake: (blockId) => {
    const items = get().getForBlock(blockId);
    return items.find((t) => t.picked) ?? items[items.length - 1];
  },

  appendTake: (blockId, assetUrl, thumbUrl, meta) => {
    const blockTakes = get().getForBlock(blockId);
    const record: TakeRecord = {
      id: newTakeId(),
      blockId,
      assetUrl,
      thumbUrl: thumbUrl ?? assetUrl,
      picked: blockTakes.length === 0,
      createdAt: new Date().toISOString(),
      meta,
    };
    set((s) => ({ takes: [...s.takes, record] }));
    return record;
  },

  pickTake: (takeId, { onBeforePick, updateNodeData }) => {
    const take = get().takes.find((t) => t.id === takeId);
    if (!take) return;
    onBeforePick?.();
    set((s) => ({
      takes: s.takes.map((t) =>
        t.blockId === take.blockId
          ? { ...t, picked: t.id === takeId }
          : t,
      ),
    }));
    updateNodeData(take.blockId, applyPrimaryTakeToNodeData(take));
  },

  openLightbox: (takeId) => set({ lightboxTakeId: takeId, comparePair: null }),
  openCompare: (takeIdA, takeIdB) =>
    set({ comparePair: [takeIdA, takeIdB], lightboxTakeId: null }),
  closeLightbox: () => set({ lightboxTakeId: null }),
  closeCompare: () => set({ comparePair: null }),
  exportTakes: () => get().takes,
}));
