import { create } from 'zustand';

export const useSkillLibraryModalUi = create<{
  open: boolean;
  focusSkillId: string | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openAt: (skillId?: string) => void;
  clearFocus: () => void;
}>((set) => ({
  open: false,
  focusSkillId: null,
  setOpen: (open) => set(open ? { open: true } : { open: false, focusSkillId: null }),
  toggle: () =>
    set((s) => (s.open ? { open: false, focusSkillId: null } : { open: true })),
  openAt: (skillId) =>
    set({
      open: true,
      focusSkillId: skillId?.trim() || null,
    }),
  clearFocus: () => set({ focusSkillId: null }),
}));
