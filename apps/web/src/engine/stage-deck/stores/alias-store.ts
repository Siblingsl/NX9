import { create } from 'zustand';

export const useAliasStore = create<{
  aliases: Record<string, string>;
  hydrate: (aliases: Record<string, string> | undefined) => void;
  setAlias: (blockId: string, alias: string) => void;
  exportAliases: () => Record<string, string>;
}>((set, get) => ({
  aliases: {},
  hydrate: (aliases) => set({ aliases: aliases ?? {} }),
  setAlias: (blockId, alias) =>
    set((s) => {
      const next = { ...s.aliases };
      const trimmed = alias.trim();
      if (!trimmed) delete next[blockId];
      else next[blockId] = trimmed;
      return { aliases: next };
    }),
  exportAliases: () => get().aliases,
}));
