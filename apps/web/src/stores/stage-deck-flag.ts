import { create } from 'zustand';

/** Stage Deck 为唯一画布模式（P4-06 legacy 已移除） */
export const useStageDeckFlag = create<{
  override: boolean | null;
  setOverride: (v: boolean | null) => void;
  isEnabled: () => boolean;
}>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
  isEnabled: () => true,
}));

export function isStageDeckEnabled(): boolean {
  return true;
}
