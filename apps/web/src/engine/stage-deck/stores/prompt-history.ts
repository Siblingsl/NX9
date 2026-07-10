import { create } from 'zustand';

export interface PromptHistoryEntry {
  id: string;
  blockId: string;
  text: string;
  savedAt: number;
}

interface PromptHistoryState {
  entries: PromptHistoryEntry[];
  push: (blockId: string, text: string) => void;
  forBlock: (blockId: string) => PromptHistoryEntry[];
}

function newId(): string {
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePromptHistory = create<PromptHistoryState>((set, get) => ({
  entries: [],
  push: (blockId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const prev = get().entries;
    const last = prev.find((e) => e.blockId === blockId);
    if (last?.text === trimmed) return;
    set({
      entries: [
        { id: newId(), blockId, text: trimmed, savedAt: Date.now() },
        ...prev.filter((e) => e.blockId !== blockId || e.text !== trimmed),
      ].slice(0, 200),
    });
  },
  forBlock: (blockId) => get().entries.filter((e) => e.blockId === blockId).slice(0, 20),
}));
